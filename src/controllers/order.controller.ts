import type { Request, Response } from "express";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

type OrderLineInput = {
  productId: string;
  quantity: number;
};

class OrderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getUserId(res: Response): string | null {
  const userId = res.locals.userId as string | undefined;
  return userId || null;
}

function parseOrderInput(body: unknown):
  | {
      vendorId: string;
      fulfillmentType: "DELIVERY" | "PICKUP";
      deliveryAddress: string | null;
      note: string | null;
      items: OrderLineInput[];
    }
  | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.vendorId !== "string" ||
    input.vendorId.trim().length === 0 ||
    (input.fulfillmentType !== "DELIVERY" &&
      input.fulfillmentType !== "PICKUP") ||
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > 100
  ) {
    return null;
  }

  const items: OrderLineInput[] = [];
  const productIds = new Set<string>();
  for (const value of input.items) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const item = value as Record<string, unknown>;
    if (
      typeof item.productId !== "string" ||
      item.productId.trim().length === 0 ||
      productIds.has(item.productId) ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 1_000_000 ||
      Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) >
        1e-8
    ) {
      return null;
    }
    productIds.add(item.productId);
    items.push({ productId: item.productId, quantity: item.quantity });
  }

  const deliveryAddress =
    typeof input.deliveryAddress === "string"
      ? input.deliveryAddress.trim()
      : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (
    (input.fulfillmentType === "DELIVERY" &&
      (deliveryAddress.length === 0 || deliveryAddress.length > 500)) ||
    note.length > 500
  ) {
    return null;
  }

  return {
    vendorId: input.vendorId.trim(),
    fulfillmentType: input.fulfillmentType,
    deliveryAddress: deliveryAddress || null,
    note: note || null,
    items,
  };
}

function formatOrder(order: {
  id: string;
  status: string;
  fulfillmentType: string;
  deliveryAddress: string | null;
  note: string | null;
  subtotal: { toNumber(): number };
  deliveryFee: { toNumber(): number };
  totalAmount: { toNumber(): number };
  createdAt: Date;
  customer?: { id: string; name: string; phone: string };
  vendor?: { id: string; shopName: string | null; name: string };
  items: {
    id: string;
    productId: string | null;
    name: string;
    quantity: { toNumber(): number };
    unitPrice: { toNumber(): number };
    totalPrice: { toNumber(): number };
    unit: string;
  }[];
}) {
  return {
    ...order,
    subtotal: order.subtotal.toNumber(),
    deliveryFee: order.deliveryFee.toNumber(),
    totalAmount: order.totalAmount.toNumber(),
    items: order.items.map((item) => ({
      ...item,
      quantity: item.quantity.toNumber(),
      unitPrice: item.unitPrice.toNumber(),
      totalPrice: item.totalPrice.toNumber(),
    })),
  };
}

export async function createCustomerOrder(req: Request, res: Response) {
  const customerId = getUserId(res);
  if (!customerId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const input = parseOrderInput(req.body);
  if (!input) {
    return res.status(400).json({ error: "অর্ডারের তথ্য সঠিকভাবে পূরণ করুন।" });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const [customer, vendor] = await Promise.all([
        tx.user.findUnique({
          where: { id: customerId },
          select: { id: true, role: true },
        }),
        tx.user.findUnique({
          where: { id: input.vendorId },
          select: {
            id: true,
            role: true,
            status: true,
            shopOpen: true,
            deliveryAvailable: true,
            deliveryFee: true,
          },
        }),
      ]);

      if (!customer || customer.role !== UserRole.CUSTOMER) {
        throw new OrderRequestError("Customer account required.", 403);
      }
      if (
        !vendor ||
        vendor.role !== UserRole.VENDOR ||
        vendor.status !== "ACTIVE"
      ) {
        throw new OrderRequestError("দোকানটি পাওয়া যায়নি।", 404);
      }
      if (!vendor.shopOpen) {
        throw new OrderRequestError("দোকানটি বর্তমানে বন্ধ আছে।", 409);
      }
      if (
        input.fulfillmentType === "DELIVERY" &&
        !vendor.deliveryAvailable
      ) {
        throw new OrderRequestError("এই দোকানে হোম ডেলিভারি চালু নেই।", 409);
      }

      const products = await tx.product.findMany({
        where: {
          vendorId: vendor.id,
          id: { in: input.items.map((item) => item.productId) },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          unit: true,
        },
      });
      if (products.length !== input.items.length) {
        throw new OrderRequestError(
          "এক বা একাধিক পণ্য আর পাওয়া যাচ্ছে না। দোকানের পণ্য তালিকা আবার দেখুন।",
          409,
        );
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      let subtotalInPaisa = 0;
      const orderItems = input.items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new OrderRequestError("পণ্যটি পাওয়া যায়নি।", 409);
        }
        if (product.stock.toNumber() < item.quantity) {
          throw new OrderRequestError(
            `${product.name} পণ্যের পর্যাপ্ত মজুত নেই।`,
            409,
          );
        }
        const unitPrice = product.price.toNumber();
        const totalPrice = Math.round(unitPrice * item.quantity * 100) / 100;
        if (!Number.isFinite(totalPrice) || totalPrice > 9_999_999_999.99) {
          throw new OrderRequestError(
            `${product.name} পণ্যের অর্ডার পরিমাণ গ্রহণযোগ্য সীমার বেশি।`,
            400,
          );
        }
        subtotalInPaisa += Math.round(totalPrice * 100);
        return {
          productId: product.id,
          name: product.name,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
          unit: product.unit,
        };
      });

      const subtotal = subtotalInPaisa / 100;
      const deliveryFee =
        input.fulfillmentType === "DELIVERY"
          ? vendor.deliveryFee?.toNumber() ?? 0
          : 0;
      if (
        subtotal > 9_999_999_999.99 ||
        subtotal + deliveryFee > 9_999_999_999.99
      ) {
        throw new OrderRequestError(
          "অর্ডারের মোট মূল্য গ্রহণযোগ্য সীমার বেশি।",
          400,
        );
      }

      return tx.customerOrder.create({
        data: {
          vendorId: vendor.id,
          customerId: customer.id,
          fulfillmentType: input.fulfillmentType,
          deliveryAddress:
            input.fulfillmentType === "DELIVERY"
              ? input.deliveryAddress
              : null,
          note: input.note,
          subtotal,
          deliveryFee,
          totalAmount: subtotal + deliveryFee,
          items: { create: orderItems },
        },
        include: {
          items: true,
          vendor: { select: { id: true, shopName: true, name: true } },
        },
      });
    });

    return res.status(201).json({ order: formatOrder(order) });
  } catch (error) {
    if (error instanceof OrderRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Could not create customer order:", error);
    return res.status(500).json({ error: "অর্ডার তৈরি করা যায়নি।" });
  }
}

export async function listVendorOrders(_req: Request, res: Response) {
  const vendorId = getUserId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const orders = await prisma.customerOrder.findMany({
      where: { vendorId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json({ orders: orders.map(formatOrder) });
  } catch (error) {
    console.error("Could not load vendor orders:", error);
    return res.status(500).json({ error: "অর্ডারের তালিকা আনা যায়নি।" });
  }
}

export async function updateVendorOrderStatus(req: Request, res: Response) {
  const vendorId = getUserId(res);
  const orderId =
    typeof req.params.orderId === "string" ? req.params.orderId : "";
  const status = req.body?.status;
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (
    !orderId ||
    !["CONFIRMED", "COMPLETED", "CANCELLED"].includes(status)
  ) {
    return res.status(400).json({ error: "অর্ডারের status সঠিক নয়।" });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.customerOrder.findFirst({
        where: { id: orderId, vendorId },
        include: { items: true },
      });
      if (!current) {
        throw new OrderRequestError("অর্ডারটি পাওয়া যায়নি।", 404);
      }

      const validTransition =
        (status === "CONFIRMED" && current.status === "PENDING") ||
        (status === "COMPLETED" && current.status === "CONFIRMED") ||
        (status === "CANCELLED" &&
          (current.status === "PENDING" || current.status === "CONFIRMED"));
      if (!validTransition) {
        throw new OrderRequestError(
          "এই অর্ডারের বর্তমান অবস্থা থেকে status পরিবর্তন করা যাবে না।",
          409,
        );
      }

      const changed = await tx.customerOrder.updateMany({
        where: { id: current.id, vendorId, status: current.status },
        data: { status },
      });
      if (changed.count !== 1) {
        throw new OrderRequestError(
          "অর্ডারটি ইতিমধ্যে পরিবর্তন হয়েছে। তালিকা refresh করুন।",
          409,
        );
      }

      if (status === "CONFIRMED") {
        for (const item of current.items) {
          if (!item.productId) continue;
          const reserved = await tx.product.updateMany({
            where: {
              id: item.productId,
              vendorId,
              isActive: true,
              stock: { gte: item.quantity },
            },
            data: { stock: { decrement: item.quantity } },
          });
          if (reserved.count !== 1) {
            throw new OrderRequestError(
              `${item.name} পণ্যের পর্যাপ্ত মজুত নেই। stock আপডেট করে আবার চেষ্টা করুন।`,
              409,
            );
          }
        }
      } else if (status === "CANCELLED" && current.status === "CONFIRMED") {
        for (const item of current.items) {
          if (!item.productId) continue;
          await tx.product.updateMany({
            where: { id: item.productId, vendorId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.customerOrder.findUniqueOrThrow({
        where: { id: current.id },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: true,
        },
      });
    });

    return res.json({ order: formatOrder(order) });
  } catch (error) {
    if (error instanceof OrderRequestError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Could not update vendor order status:", error);
    return res.status(500).json({ error: "অর্ডারের status পরিবর্তন করা যায়নি।" });
  }
}
