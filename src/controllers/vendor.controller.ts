import type { Request, Response } from "express";
import crypto from "node:crypto";
import { LedgerEntryType, UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { normalizePhone } from "../lib/phone.js";

export async function getVendorShop(_req: Request, res: Response) {
  const vendorId = res.locals.userId as string | undefined;
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        role: true,
        shopName: true,
        shopOpen: true,
        deliveryAvailable: true,
        deliveryFee: true,
        deliveryNote: true,
        locationChangeRequest: true,
        division: true,
        district: true,
        upazila: true,
        unionName: true,
        market: true,
        businessCategory: {
          select: { id: true, name: true, englishName: true },
        },
      },
    });

    if (!vendor || vendor.role !== UserRole.VENDOR) {
      return res.status(403).json({ error: "Vendor access required." });
    }

    return res.json({
      shop: {
        ...vendor,
        union: vendor.unionName,
      },
    });
  } catch (error) {
    console.error("Could not load vendor shop:", error);
    return res.status(500).json({ error: "Could not load shop settings." });
  }
}

export async function updateVendorShopAvailability(
  req: Request,
  res: Response,
) {
  const vendorId = res.locals.userId as string | undefined;
  const isOpen = req.body?.isOpen;

  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (typeof isOpen !== "boolean") {
    return res.status(400).json({ error: "Choose whether the shop is open." });
  }

  try {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: { role: true },
    });
    if (!vendor || vendor.role !== UserRole.VENDOR) {
      return res.status(403).json({ error: "Vendor access required." });
    }

    const updatedVendor = await prisma.user.update({
      where: { id: vendorId },
      data: { shopOpen: isOpen },
      select: { shopOpen: true },
    });
    return res.json({ shopOpen: updatedVendor.shopOpen });
  } catch (error) {
    console.error("Could not update vendor shop availability:", error);
    return res.status(500).json({ error: "Could not update shop availability." });
  }
}

export async function updateVendorShopDelivery(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const { deliveryAvailable, deliveryFee, deliveryNote } = req.body ?? {};

  if (typeof deliveryAvailable !== "boolean") {
    return res.status(400).json({ error: "ডেলিভারি স্ট্যাটাস (true/false) প্রয়োজন।" });
  }

  try {
    const data: {
      deliveryAvailable: boolean;
      deliveryFee?: number | null;
      deliveryNote?: string | null;
    } = {
      deliveryAvailable,
    };
    if (typeof deliveryFee === "number") {
      data.deliveryFee = deliveryFee;
    } else if (deliveryFee === null) {
      data.deliveryFee = null;
    }
    if (typeof deliveryNote === "string") {
      data.deliveryNote = deliveryNote.trim();
    } else if (deliveryNote === null) {
      data.deliveryNote = null;
    }

    const updatedVendor = await prisma.user.update({
      where: { id: vendorId },
      data,
      select: {
        deliveryAvailable: true,
        deliveryFee: true,
        deliveryNote: true,
      },
    });

    return res.json({
      deliveryAvailable: updatedVendor.deliveryAvailable,
      deliveryFee: updatedVendor.deliveryFee ? Number(updatedVendor.deliveryFee) : null,
      deliveryNote: updatedVendor.deliveryNote,
    });
  } catch (error) {
    console.error("Could not update vendor delivery status:", error);
    return res.status(500).json({ error: "হোম ডেলিভারি সেটিংস আপডেট করা যায়নি।" });
  }
}

export async function requestVendorLocationChange(
  req: Request,
  res: Response,
) {
  const vendorId = res.locals.userId as string | undefined;
  const { division, district, upazila, union: unionName, market } =
    req.body ?? {};
  const locationValues = [division, district, upazila, unionName, market];

  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (
    locationValues.some(
      (value) =>
        typeof value !== "string" ||
        value.trim().length === 0 ||
        value.trim().length > 120,
    )
  ) {
    return res.status(400).json({
      error: "Division, district, upazila, union and market are required.",
    });
  }

  try {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: { role: true, locationChangeRequest: true },
    });
    if (!vendor || vendor.role !== UserRole.VENDOR) {
      return res.status(403).json({ error: "Vendor access required." });
    }
    if (vendor.locationChangeRequest) {
      return res.status(409).json({
        error: "A location change request is already awaiting admin review.",
      });
    }

    await prisma.user.update({
      where: { id: vendorId },
      data: {
        locationChangeRequest: {
          division: division.trim(),
          district: district.trim(),
          upazila: upazila.trim(),
          union: unionName.trim(),
          market: market.trim(),
          requestedAt: new Date().toISOString(),
        },
      },
    });
    return res.status(202).json({ message: "Location change request submitted." });
  } catch (error) {
    console.error("Could not submit vendor location request:", error);
    return res.status(500).json({ error: "Could not submit location request." });
  }
}

export async function updateVendorShopName(req: Request, res: Response) {
  const vendorId = res.locals.userId as string | undefined;
  const shopName = req.body?.shopName;

  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (
    typeof shopName !== "string" ||
    shopName.trim().length < 2 ||
    shopName.trim().length > 120
  ) {
    return res.status(400).json({
      error: "Shop name must be between 2 and 120 characters.",
    });
  }

  try {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: { role: true },
    });
    if (!vendor || vendor.role !== UserRole.VENDOR) {
      return res.status(403).json({ error: "Vendor access required." });
    }

    const updatedVendor = await prisma.user.update({
      where: { id: vendorId },
      data: { shopName: shopName.trim() },
      select: { shopName: true },
    });
    return res.json({ shopName: updatedVendor.shopName });
  } catch (error) {
    console.error("Could not update vendor shop name:", error);
    return res.status(500).json({ error: "Could not save shop name." });
  }
}

function getVendorId(res: Response): string | undefined {
  return res.locals.userId as string | undefined;
}

function getRouteId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 80 ? name : null;
}

function productInput(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const name =
    typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const costPrice =
    typeof input.costPrice === "number" || typeof input.costPrice === "string"
      ? Number(input.costPrice)
      : 0;
  const price =
    typeof input.price === "number" || typeof input.price === "string"
      ? Number(input.price)
      : Number.NaN;
  const stock =
    typeof input.stock === "number" || typeof input.stock === "string"
      ? Number(input.stock)
      : Number.NaN;
  const unit = typeof input.unit === "string" ? input.unit.trim() : "";
  const categoryId =
    typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  const isActive = input.isActive === undefined ? true : input.isActive;

  if (
    name.length < 2 ||
    name.length > 120 ||
    description.length > 1000 ||
    !Number.isFinite(costPrice) ||
    costPrice < 0 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(stock) ||
    stock < 0 ||
    unit.length < 1 ||
    unit.length > 30 ||
    categoryId.length === 0 ||
    typeof isActive !== "boolean"
  ) {
    return null;
  }

  return {
    name,
    description: description || null,
    costPrice,
    price,
    stock,
    unit,
    categoryId,
    isActive,
  };
}

export async function getVendorCategories(_req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const categories = await prisma.category.findMany({
      where: { vendorId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });
    return res.json({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        productCount: category._count.products,
      })),
    });
  } catch (error) {
    console.error("Could not load vendor categories:", error);
    return res.status(500).json({ error: "Could not load categories." });
  }
}

export async function createVendorCategory(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const name = normalizedName(req.body?.name);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!name) {
    return res.status(400).json({
      error: "Category name must be between 1 and 80 characters.",
    });
  }

  try {
    const category = await prisma.category.create({
      data: { vendorId, name },
      select: { id: true, name: true },
    });
    return res.status(201).json({ category: { ...category, productCount: 0 } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ error: "এই category আগে থেকেই আছে।" });
    }
    console.error("Could not create vendor category:", error);
    return res.status(500).json({ error: "Could not create category." });
  }
}

export async function createVendorCategoriesBatch(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const names = Array.isArray(req.body?.names)
    ? req.body.names
        .map((name: unknown) => (typeof name === "string" ? name.trim() : ""))
        .filter((name: string) => name.length >= 1 && name.length <= 80)
    : [];

  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (names.length === 0) {
    return res.status(400).json({ error: "কমপক্ষে একটি ক্যাটাগরি নাম প্রয়োজন।" });
  }

  try {
    const existing = await prisma.category.findMany({
      where: { vendorId },
      select: { name: true },
    });
    const existingSet = new Set(existing.map((c) => c.name.toLowerCase()));
    const toCreate = names.filter((n: string) => !existingSet.has(n.toLowerCase()));

    if (toCreate.length > 0) {
      await prisma.category.createMany({
        data: toCreate.map((name: string) => ({ vendorId, name })),
        skipDuplicates: true,
      });
    }

    const allCategories = await prisma.category.findMany({
      where: { vendorId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });

    return res.status(201).json({
      createdCount: toCreate.length,
      categories: allCategories.map((c) => ({
        id: c.id,
        name: c.name,
        productCount: c._count.products,
      })),
    });
  } catch (error) {
    console.error("Could not batch create vendor categories:", error);
    return res.status(500).json({ error: "ক্যাটাগরি ব্যাচ তৈরি করা যায়নি।" });
  }
}

export async function updateVendorCategory(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const categoryId = getRouteId(req.params.categoryId);
  const name = normalizedName(req.body?.name);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!categoryId) {
    return res.status(400).json({ error: "Category ID is required." });
  }
  if (!name) {
    return res.status(400).json({
      error: "Category name must be between 1 and 80 characters.",
    });
  }

  try {
    const result = await prisma.category.updateMany({
      where: { id: categoryId, vendorId },
      data: { name },
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "Category not found." });
    }
    return res.json({ category: { id: categoryId, name } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ error: "এই category আগে থেকেই আছে।" });
    }
    console.error("Could not update vendor category:", error);
    return res.status(500).json({ error: "Could not update category." });
  }
}

export async function deleteVendorCategory(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const categoryId = getRouteId(req.params.categoryId);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!categoryId) {
    return res.status(400).json({ error: "Category ID is required." });
  }

  try {
    const result = await prisma.category.deleteMany({
      where: { id: categoryId, vendorId, products: { none: {} } },
    });
    if (result.count === 0) {
      const exists = await prisma.category.findFirst({
        where: { id: categoryId, vendorId },
        select: { id: true },
      });
      if (!exists) return res.status(404).json({ error: "Category not found." });
      return res.status(409).json({
        error: "এই category-তে পণ্য আছে; আগে পণ্যগুলো অন্য category-তে সরান।",
      });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("Could not delete vendor category:", error);
    return res.status(500).json({ error: "Could not delete category." });
  }
}

export async function getVendorProducts(_req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const products = await prisma.product.findMany({
      where: { vendorId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return res.json({
      products: products.map((product) => ({
        ...product,
        costPrice: product.costPrice.toNumber(),
        price: product.price.toNumber(),
        stock: product.stock.toNumber(),
      })),
    });
  } catch (error) {
    console.error("Could not load vendor products:", error);
    return res.status(500).json({ error: "Could not load products." });
  }
}

export async function createVendorProduct(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const input = productInput(req.body);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!input) {
    return res.status(400).json({
      error:
        "পণ্যের নাম, category, সঠিক দাম, মজুত, একক ও status দিয়ে আবার চেষ্টা করুন।",
    });
  }

  try {
    const product = await prisma.product.create({
      data: { ...input, vendorId },
      include: { category: { select: { id: true, name: true } } },
    });
    return res.status(201).json({
      product: {
        ...product,
        costPrice: product.costPrice.toNumber(),
        price: product.price.toNumber(),
        stock: product.stock.toNumber(),
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2003"
    ) {
      return res.status(400).json({ error: "নিজের একটি category নির্বাচন করুন।" });
    }
    console.error("Could not create vendor product:", error);
    return res.status(500).json({ error: "Could not create product." });
  }
}

export async function updateVendorProduct(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const productId = getRouteId(req.params.productId);
  const input = productInput(req.body);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!productId) {
    return res.status(400).json({ error: "Product ID is required." });
  }
  if (!input) {
    return res.status(400).json({
      error:
        "পণ্যের নাম, category, সঠিক দাম, মজুত, একক ও status দিয়ে আবার চেষ্টা করুন।",
    });
  }

  try {
    const result = await prisma.product.updateMany({
      where: { id: productId, vendorId },
      data: input,
    });
    if (result.count === 0) {
      const exists = await prisma.product.findFirst({
        where: { id: productId, vendorId },
        select: { id: true },
      });
      if (!exists) return res.status(404).json({ error: "Product not found." });
    }
    const product = await prisma.product.findFirst({
      where: { id: productId, vendorId },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!product) return res.status(404).json({ error: "Product not found." });
    return res.json({
      product: {
        ...product,
        costPrice: product.costPrice.toNumber(),
        price: product.price.toNumber(),
        stock: product.stock.toNumber(),
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2003"
    ) {
      return res.status(400).json({ error: "নিজের একটি category নির্বাচন করুন।" });
    }
    console.error("Could not update vendor product:", error);
    return res.status(500).json({ error: "Could not update product." });
  }
}

export async function deleteVendorProduct(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const productId = getRouteId(req.params.productId);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!productId) {
    return res.status(400).json({ error: "Product ID is required." });
  }

  try {
    const result = await prisma.product.deleteMany({
      where: { id: productId, vendorId },
    });
    if (result.count === 0) return res.status(404).json({ error: "Product not found." });
    return res.status(204).send();
  } catch (error) {
    console.error("Could not delete vendor product:", error);
    return res.status(500).json({ error: "Could not delete product." });
  }
}

function customerInput(body: unknown): {
  error?: string;
  data?: {
    name: string;
    phone: string | null;
    address: string;
    division: string | null;
    district: string | null;
    upazila: string | null;
    unionName: string | null;
    village: string | null;
  };
} {
  if (!body || typeof body !== "object") return { error: "তথ্য সঠিকভাবে প্রদান করুন।" };
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const division = typeof input.division === "string" ? input.division.trim() : null;
  const district = typeof input.district === "string" ? input.district.trim() : null;
  const upazila = typeof input.upazila === "string" ? input.upazila.trim() : null;
  const unionName =
    typeof input.unionName === "string"
      ? input.unionName.trim()
      : typeof input.union === "string"
        ? input.union.trim()
        : null;
  const village = typeof input.village === "string" ? input.village.trim() : null;

  if (name.length < 2 || name.length > 100) {
    return { error: "গ্রাহকের নাম ২ থেকে ১০০ অক্ষরের মধ্যে দিন।" };
  }

  const rawPhone =
    input.phone === undefined || input.phone === null
      ? ""
      : typeof input.phone === "string"
        ? input.phone.trim()
        : null;

  if (rawPhone === null) return { error: "সঠিক মোবাইল নম্বর প্রদান করুন।" };

  let normalizedPhone: string | null = null;
  if (rawPhone.length > 0) {
    normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) {
      return { error: "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।" };
    }
  }

  const fullAddress =
    address || [village, unionName, upazila, district, division].filter(Boolean).join(", ");
  if (fullAddress.length < 2 || fullAddress.length > 300) {
    return { error: "গ্রাহকের ঠিকানা প্রদান করুন।" };
  }

  return {
    data: {
      name,
      phone: normalizedPhone,
      address: fullAddress,
      division: division || null,
      district: district || null,
      upazila: upazila || null,
      unionName: unionName || null,
      village: village || null,
    },
  };
}

function ledgerEntryInput(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const type = input.type;
  const amount =
    typeof input.amount === "number" || typeof input.amount === "string"
      ? Number(input.amount)
      : Number.NaN;
  const amountText =
    typeof input.amount === "number" || typeof input.amount === "string"
      ? String(input.amount)
      : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (
    (type !== "DUE" && type !== "PAYMENT") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d{1,10}(\.\d{1,2})?$/.test(amountText) ||
    note.length > 300
  ) {
    return null;
  }
  return {
    type: type === "DUE" ? LedgerEntryType.DUE : LedgerEntryType.PAYMENT,
    amount,
    note: note || null,
  };
}

export async function searchVendorCustomerByPhone(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) return res.status(401).json({ error: "Authentication required." });

  const rawPhone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  if (!rawPhone) return res.status(400).json({ error: "মোবাইল নম্বর প্রদান করুন।" });

  const normalizedPhone = normalizePhone(rawPhone) || rawPhone;

  try {
    // 1. Check if customer is already in this vendor's shop
    const customer = await prisma.vendorCustomer.findFirst({
      where: {
        vendorId,
        OR: [
          { phone: normalizedPhone },
          { phone: rawPhone },
        ],
      },
      include: {
        linkedUser: { select: { id: true, name: true, phone: true } },
      },
    });

    if (customer) {
      const totals = await prisma.customerLedgerEntry.groupBy({
        by: ["type"],
        where: { vendorId, customerId: customer.id },
        _sum: { amount: true },
      });

      let balance = 0;
      for (const total of totals) {
        const amount = total._sum.amount?.toNumber() ?? 0;
        balance += total.type === LedgerEntryType.DUE ? amount : -amount;
      }

      return res.json({
        exists: true,
        inShop: true,
        customer: {
          ...customer,
          balance: Math.round(balance * 100) / 100,
        },
      });
    }

    // 2. Check if customer is a registered User on the platform
    const registeredUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: rawPhone },
        ],
        role: UserRole.CUSTOMER,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        division: true,
        district: true,
        upazila: true,
        unionName: true,
        market: true,
      },
    });

    if (registeredUser) {
      return res.json({
        exists: true,
        inShop: false,
        phone: rawPhone,
        normalizedPhone,
        registeredUser: {
          ...registeredUser,
          union: registeredUser.unionName,
        },
      });
    }

    // 3. Not found anywhere
    return res.json({
      exists: false,
      inShop: false,
      phone: rawPhone,
      normalizedPhone,
    });
  } catch (error) {
    console.error("Could not search vendor customer by phone:", error);
    return res.status(500).json({ error: "গ্রাহক অনুসন্ধানে সমস্যা হয়েছে।" });
  }
}

export async function getVendorCustomers(_req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const [customers, totals] = await Promise.all([
      prisma.vendorCustomer.findMany({
        where: { vendorId },
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      }),
      prisma.customerLedgerEntry.groupBy({
        by: ["customerId", "type"],
        where: { vendorId },
        _sum: { amount: true },
      }),
    ]);

    const balances = new Map<string, number>();
    for (const total of totals) {
      const current = balances.get(total.customerId) ?? 0;
      const amount = total._sum.amount?.toNumber() ?? 0;
      balances.set(
        total.customerId,
        Math.round(
          (current + (total.type === "DUE" ? amount : -amount)) * 100,
        ) / 100,
      );
    }

    return res.json({
      customers: customers.map((customer) => ({
        ...customer,
        balance: balances.get(customer.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error("Could not load vendor customers:", error);
    return res.status(500).json({ error: "Could not load customers." });
  }
}

export async function createVendorCustomer(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const parsed = customerInput(req.body);
  if (parsed.error || !parsed.data) {
    return res.status(400).json({ error: parsed.error || "গ্রাহকের নাম ও ঠিকানা দিন।" });
  }

  const input = parsed.data;

  try {
    if (input.phone) {
      const existing = await prisma.vendorCustomer.findUnique({
        where: {
          vendorId_phone: {
            vendorId,
            phone: input.phone,
          },
        },
      });

      if (existing) {
        return res.status(409).json({
          error: "এই মোবাইল নম্বরের একজন গ্রাহক আপনার দোকানে ইতিমধ্যে নিবন্ধিত আছেন।",
          customer: existing,
        });
      }
    }

    let linkedUserId: string | null = null;
    if (input.phone) {
      const customerUser = await prisma.user.findUnique({
        where: { phone: input.phone },
        select: { id: true, role: true },
      });
      if (customerUser && customerUser.role === UserRole.CUSTOMER) {
        linkedUserId = customerUser.id;
      }
    }

    const customer = await prisma.vendorCustomer.create({
      data: {
        ...input,
        vendorId,
        linkedUserId,
      },
    });

    return res.status(201).json({ customer: { ...customer, balance: 0 } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ error: "এই মোবাইল নম্বরের গ্রাহক আপনার দোকানে ইতিমধ্যে আছেন।" });
    }
    console.error("Could not create vendor customer:", error);
    return res.status(500).json({ error: "গ্রাহক যোগ করা যায়নি।" });
  }
}

export async function updateVendorCustomer(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const customerId = getRouteId(req.params.customerId);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!customerId) {
    return res.status(400).json({ error: "Customer ID is required." });
  }

  const parsed = customerInput(req.body);
  if (parsed.error || !parsed.data) {
    return res.status(400).json({ error: parsed.error || "গ্রাহকের নাম ও ঠিকানা দিন।" });
  }

  const input = parsed.data;

  try {
    if (input.phone) {
      const duplicate = await prisma.vendorCustomer.findFirst({
        where: {
          vendorId,
          phone: input.phone,
          id: { not: customerId },
        },
      });
      if (duplicate) {
        return res.status(409).json({
          error: "এই মোবাইল নম্বরটি আপনার অন্য একজন গ্রাহকের জন্য ইতিমধ্যে ব্যবহৃত হয়েছে।",
        });
      }
    }

    const result = await prisma.vendorCustomer.updateMany({
      where: { id: customerId, vendorId },
      data: input,
    });
    if (result.count === 0) {
      return res.status(404).json({ error: "Customer not found." });
    }

    const customer = await prisma.vendorCustomer.findFirst({
      where: { id: customerId, vendorId },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    return res.json({ customer });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ error: "এই মোবাইল নম্বরের গ্রাহক আপনার দোকানে ইতিমধ্যে আছেন।" });
    }
    console.error("Could not update vendor customer:", error);
    return res.status(500).json({ error: "গ্রাহকের তথ্য আপডেট করা যায়নি।" });
  }
}

export async function getVendorCustomerLedger(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const customerId = getRouteId(req.params.customerId);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!customerId) {
    return res.status(400).json({ error: "Customer ID is required." });
  }

  try {
    const customer = await prisma.vendorCustomer.findFirst({
      where: { id: customerId, vendorId },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        division: true,
        district: true,
        upazila: true,
        unionName: true,
        village: true,
        linkedUserId: true,
      },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    const [entries, sales] = await Promise.all([
      prisma.customerLedgerEntry.findMany({
        where: { customerId, vendorId },
        orderBy: { createdAt: "desc" },
        include: {
          sale: {
            include: {
              items: true,
            },
          },
        },
      }),
      prisma.sale.findMany({
        where: { customerId, vendorId },
        orderBy: { createdAt: "desc" },
        include: { items: true },
      }),
    ]);

    const balance =
      Math.round(
        entries.reduce(
          (total, entry) =>
            total +
            (entry.type === "DUE" ? 1 : -1) * entry.amount.toNumber(),
          0,
        ) * 100,
      ) / 100;

    return res.json({
      customer,
      balance,
      entries: entries.map((entry) => ({
        ...entry,
        amount: entry.amount.toNumber(),
        sale: entry.sale
          ? {
              ...entry.sale,
              totalAmount: entry.sale.totalAmount.toNumber(),
              paidAmount: entry.sale.paidAmount.toNumber(),
              dueAmount: entry.sale.dueAmount.toNumber(),
              items: entry.sale.items.map((it) => ({
                ...it,
                quantity: it.quantity.toNumber(),
                unitPrice: it.unitPrice.toNumber(),
                totalPrice: it.totalPrice.toNumber(),
              })),
            }
          : null,
      })),
      sales: sales.map((sale) => ({
        ...sale,
        totalAmount: sale.totalAmount.toNumber(),
        paidAmount: sale.paidAmount.toNumber(),
        dueAmount: sale.dueAmount.toNumber(),
        items: sale.items.map((it) => ({
          ...it,
          quantity: it.quantity.toNumber(),
          unitPrice: it.unitPrice.toNumber(),
          totalPrice: it.totalPrice.toNumber(),
        })),
      })),
    });
  } catch (error) {
    console.error("Could not load customer ledger:", error);
    return res.status(500).json({ error: "Could not load customer ledger." });
  }
}

export async function addCustomerLedgerEntry(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const customerId = getRouteId(req.params.customerId);
  const input = ledgerEntryInput(req.body);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!customerId) {
    return res.status(400).json({ error: "Customer ID is required." });
  }
  if (!input) {
    return res.status(400).json({
      error: "বাকি বা জমার ধরন এবং ০-এর বেশি সঠিক পরিমাণ দিন।",
    });
  }

  try {
    const customer = await prisma.vendorCustomer.findFirst({
      where: { id: customerId, vendorId },
      select: { id: true },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    const entry = await prisma.customerLedgerEntry.create({
      data: { ...input, customerId, vendorId },
    });
    return res.status(201).json({
      entry: { ...entry, amount: entry.amount.toNumber() },
    });
  } catch (error) {
    console.error("Could not add customer ledger entry:", error);
    return res.status(500).json({ error: "Could not save ledger entry." });
  }
}

export async function createVendorSale(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const { customerId, items, paidAmount = 0, note, dueDate } = req.body ?? {};
  if (!customerId || typeof customerId !== "string") {
    return res.status(400).json({ error: "গ্রাহক নির্বাচন করুন।" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "অন্তত একটি পণ্য যোগ করুন।" });
  }

  type ParsedItem = {
    productId?: string | null;
    name: string;
    quantity: number;
    costPrice: number;
    unitPrice: number;
    totalPrice: number;
    profit: number;
    unit: string;
  };

  const vendorProducts = await prisma.product.findMany({
    where: { vendorId },
    select: { id: true, name: true, costPrice: true, stock: true },
  });

  const parsedItems: ParsedItem[] = [];
  let calculatedTotal = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") {
      return res.status(400).json({ error: "পণ্যের সঠিক বিবরণ দিন।" });
    }
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const unit = typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : "কেজি";
    const productId = typeof item.productId === "string" && item.productId ? item.productId : null;

    if (!name || name.length < 1 || name.length > 150) {
      return res.status(400).json({ error: "পণ্যের নাম সঠিক দিন।" });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: `"${name}" পণ্যের পরিমাণ সঠিক নয়।` });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ error: `"${name}" পণ্যের দর সঠিক নয়।` });
    }

    let matchedProd = productId ? vendorProducts.find((p) => p.id === productId) : null;
    if (!matchedProd) {
      matchedProd = vendorProducts.find((p) => p.name.toLowerCase() === name.toLowerCase()) || null;
    }

    const costPrice =
      Number(item.costPrice) >= 0 && item.costPrice !== undefined && item.costPrice !== ""
        ? Number(item.costPrice)
        : matchedProd ? matchedProd.costPrice.toNumber() : 0;

    const itemTotal = Math.round(quantity * unitPrice * 100) / 100;
    const itemCost = Math.round(quantity * costPrice * 100) / 100;
    const itemProfit = Math.round((itemTotal - itemCost) * 100) / 100;

    calculatedTotal += itemTotal;
    parsedItems.push({
      productId: matchedProd?.id || productId,
      name,
      quantity,
      costPrice,
      unitPrice,
      totalPrice: itemTotal,
      profit: itemProfit,
      unit,
    });
  }

  calculatedTotal = Math.round(calculatedTotal * 100) / 100;
  const numPaid = Number(paidAmount);
  if (!Number.isFinite(numPaid) || numPaid < 0) {
    return res.status(400).json({ error: "পরিশোধিত টাকার পরিমাণ সঠিক দিন।" });
  }

  const dueAmount = Math.max(0, Math.round((calculatedTotal - numPaid) * 100) / 100);
  const parsedDueDate = dueDate ? new Date(dueDate) : null;

  try {
    const customer = await prisma.vendorCustomer.findFirst({
      where: { id: customerId, vendorId },
      select: { id: true, name: true },
    });
    if (!customer) {
      return res.status(404).json({ error: "গ্রাহক খুঁজে পাওয়া যায়নি।" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          vendorId,
          customerId,
          totalAmount: calculatedTotal,
          paidAmount: numPaid,
          dueAmount,
          note: note ? String(note).trim() : null,
          dueDate: parsedDueDate,
          items: {
            create: parsedItems.map((pi) => ({
              productId: pi.productId,
              name: pi.name,
              quantity: pi.quantity,
              costPrice: pi.costPrice,
              unitPrice: pi.unitPrice,
              totalPrice: pi.totalPrice,
              profit: pi.profit,
              unit: pi.unit,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      if (dueAmount > 0) {
        await tx.customerLedgerEntry.create({
          data: {
            vendorId,
            customerId,
            saleId: sale.id,
            type: LedgerEntryType.DUE,
            amount: dueAmount,
            note: note ? `বিক্রি রশিদ (${note})` : `বিক্রি রশিদ #${sale.id.slice(-6).toUpperCase()}`,
          },
        });
      }

      return sale;
    });

    const totals = await prisma.customerLedgerEntry.groupBy({
      by: ["type"],
      where: { vendorId, customerId },
      _sum: { amount: true },
    });

    let balance = 0;
    for (const total of totals) {
      const amount = total._sum.amount?.toNumber() ?? 0;
      balance += total.type === LedgerEntryType.DUE ? amount : -amount;
    }
    balance = Math.round(balance * 100) / 100;

    return res.status(201).json({
      sale: {
        ...result,
        totalAmount: result.totalAmount.toNumber(),
        paidAmount: result.paidAmount.toNumber(),
        dueAmount: result.dueAmount.toNumber(),
        items: result.items.map((it) => ({
          ...it,
          quantity: it.quantity.toNumber(),
          unitPrice: it.unitPrice.toNumber(),
          totalPrice: it.totalPrice.toNumber(),
        })),
      },
      balance,
    });
  } catch (error) {
    console.error("Could not create sale:", error);
    return res.status(500).json({ error: "বিক্রির হিসাব সংরক্ষণ করা যায়নি।" });
  }
}

export async function getVendorCustomerSales(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const customerId = getRouteId(req.params.customerId);
  if (!vendorId) return res.status(401).json({ error: "Authentication required." });
  if (!customerId) return res.status(400).json({ error: "Customer ID is required." });

  try {
    const sales = await prisma.sale.findMany({
      where: { vendorId, customerId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      sales: sales.map((sale) => ({
        ...sale,
        totalAmount: sale.totalAmount.toNumber(),
        paidAmount: sale.paidAmount.toNumber(),
        dueAmount: sale.dueAmount.toNumber(),
        items: sale.items.map((it) => ({
          ...it,
          quantity: it.quantity.toNumber(),
          unitPrice: it.unitPrice.toNumber(),
          totalPrice: it.totalPrice.toNumber(),
        })),
      })),
    });
  } catch (error) {
    console.error("Could not load customer sales:", error);
    return res.status(500).json({ error: "বিক্রির ইতিহাস লোড করা যায়নি।" });
  }
}

export async function createCustomerInviteLink(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  const customerId = getRouteId(req.params.customerId);
  if (!vendorId) return res.status(401).json({ error: "Authentication required." });
  if (!customerId) return res.status(400).json({ error: "Customer ID is required." });

  try {
    const customer = await prisma.vendorCustomer.findFirst({
      where: { id: customerId, vendorId },
      include: {
        vendor: {
          select: { shopName: true, name: true, phone: true },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "গ্রাহক খুঁজে পাওয়া যায়নি।" });
    }

    if (!customer.phone) {
      return res.status(400).json({
        error: "ইনভাইট লিংক তৈরি করতে গ্রাহকের মোবাইল নম্বর প্রয়োজন। আগে ফোন নম্বর যোগ করুন।",
      });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.accountLinkRequest.create({
      data: {
        vendorId,
        vendorCustomerId: customer.id,
        customerPhone: customer.phone,
        token,
        status: "PENDING",
        expiresAt,
      },
    });

    const invitePath = `/account-setup?token=${token}`;
    return res.status(201).json({
      inviteUrl: invitePath,
      token,
      expiresAt: expiresAt.toISOString(),
      customerName: customer.name,
      customerPhone: customer.phone,
      shopName: customer.vendor.shopName,
    });
  } catch (error) {
    console.error("Could not create customer invite:", error);
    return res.status(500).json({ error: "ইনভাইট লিংক তৈরি করা যায়নি।" });
  }
}


export async function getVendorProfitReport(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const monthQuery = typeof req.query.month === "string" ? req.query.month.trim() : "";
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (/^\d{4}-\d{2}$/.test(monthQuery)) {
      const parts = monthQuery.split("-");
      const year = parseInt(parts[0] || "2026", 10);
      const monthIndex = parseInt(parts[1] || "1", 10) - 1;
      startDate = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
    } else {
      startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
      endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0));
    }

    const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
    const dayOfWeek = now.getDay();
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - dayOfWeek);

    const [monthSales, todaySales, weekSales] = await Promise.all([
      prisma.sale.findMany({
        where: {
          vendorId,
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.findMany({
        where: {
          vendorId,
          createdAt: { gte: todayStart },
        },
        include: { items: true },
      }),
      prisma.sale.findMany({
        where: {
          vendorId,
          createdAt: { gte: weekStart },
        },
        include: { items: true },
      }),
    ]);

    let totalSales = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalPaid = 0;
    let totalDue = 0;

    const productStatsMap = new Map<string, {
      name: string;
      unit: string;
      totalQuantity: number;
      totalRevenue: number;
      totalCost: number;
      totalProfit: number;
      salesCount: number;
    }>();

    const dailyStatsMap = new Map<string, {
      date: string;
      sales: number;
      cost: number;
      profit: number;
      count: number;
    }>();

    for (const sale of monthSales) {
      const saleAmount = sale.totalAmount.toNumber();
      const paid = sale.paidAmount.toNumber();
      const due = sale.dueAmount.toNumber();

      totalSales += saleAmount;
      totalPaid += paid;
      totalDue += due;

      const dateKey = sale.createdAt.toISOString().slice(0, 10);
      const dayEntry = dailyStatsMap.get(dateKey) || {
        date: dateKey,
        sales: 0,
        cost: 0,
        profit: 0,
        count: 0,
      };

      for (const item of sale.items) {
        const itemQty = item.quantity.toNumber();
        const itemCost = item.costPrice.toNumber();
        const itemRevenue = item.totalPrice.toNumber();
        const itemProfit = item.profit.toNumber();
        const totalItemCost = Math.round(itemQty * itemCost * 100) / 100;

        totalCost += totalItemCost;
        totalProfit += itemProfit;

        dayEntry.sales += itemRevenue;
        dayEntry.cost += totalItemCost;
        dayEntry.profit += itemProfit;

        const prodKey = item.name.toLowerCase().trim();
        const existingProd = productStatsMap.get(prodKey) || {
          name: item.name,
          unit: item.unit,
          totalQuantity: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          salesCount: 0,
        };

        existingProd.totalQuantity += itemQty;
        existingProd.totalRevenue += itemRevenue;
        existingProd.totalCost += totalItemCost;
        existingProd.totalProfit += itemProfit;
        existingProd.salesCount += 1;
        productStatsMap.set(prodKey, existingProd);
      }

      dayEntry.count += 1;
      dailyStatsMap.set(dateKey, dayEntry);
    }

    let todayProfit = 0;
    let todaySalesTotal = 0;
    for (const s of todaySales) {
      todaySalesTotal += s.totalAmount.toNumber();
      for (const it of s.items) todayProfit += it.profit.toNumber();
    }

    let weekProfit = 0;
    let weekSalesTotal = 0;
    for (const s of weekSales) {
      weekSalesTotal += s.totalAmount.toNumber();
      for (const it of s.items) weekProfit += it.profit.toNumber();
    }

    const productBreakdown = Array.from(productStatsMap.values()).map((p) => ({
      ...p,
      margin: p.totalRevenue > 0 ? Math.round((p.totalProfit / p.totalRevenue) * 100) : 0,
    })).sort((a, b) => b.totalProfit - a.totalProfit);

    const dailyBreakdown = Array.from(dailyStatsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const overallMargin = totalSales > 0 ? Math.round((totalProfit / totalSales) * 100) : 0;

    return res.json({
      selectedMonth: monthQuery || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      totalSales: Math.round(totalSales * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      marginPercentage: overallMargin,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      totalOrders: monthSales.length,
      todayStats: {
        sales: Math.round(todaySalesTotal * 100) / 100,
        profit: Math.round(todayProfit * 100) / 100,
      },
      weekStats: {
        sales: Math.round(weekSalesTotal * 100) / 100,
        profit: Math.round(weekProfit * 100) / 100,
      },
      productBreakdown,
      dailyBreakdown,
      recentSales: monthSales.slice(0, 20).map((s) => ({
        id: s.id,
        customerName: s.customer.name,
        customerPhone: s.customer.phone,
        totalAmount: s.totalAmount.toNumber(),
        paidAmount: s.paidAmount.toNumber(),
        dueAmount: s.dueAmount.toNumber(),
        createdAt: s.createdAt,
        itemCount: s.items.length,
        profit: s.items.reduce((sum, it) => sum + it.profit.toNumber(), 0),
      })),
    });
  } catch (error) {
    console.error("Could not calculate profit report:", error);
    return res.status(500).json({ error: "লাভের হিসাব লোড করা যায়নি।" });
  }
}


export async function getVendorDashboard(req: Request, res: Response) {
  const vendorId = getVendorId(res);
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));

    const [
      vendor,
      productCount,
      lowStockProducts,
      todaySales,
      monthSales,
      weeklySalesRecords,
      recentSales,
      customerTotals,
      totalCustomersCount,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: vendorId },
        select: { id: true, name: true, shopName: true, shopOpen: true, phone: true },
      }),
      prisma.product.count({ where: { vendorId, isActive: true } }),
      prisma.product.findMany({
        where: { vendorId, isActive: true, stock: { lte: 5 } },
        orderBy: { stock: "asc" },
        take: 5,
        select: { id: true, name: true, stock: true, unit: true, price: true },
      }),
      prisma.sale.findMany({
        where: { vendorId, createdAt: { gte: todayStart } },
        include: { items: true },
      }),
      prisma.sale.findMany({
        where: { vendorId, createdAt: { gte: monthStart } },
        include: { items: true },
      }),
      prisma.sale.findMany({
        where: { vendorId, createdAt: { gte: sevenDaysAgo } },
        select: { totalAmount: true, createdAt: true },
      }),
      prisma.sale.findMany({
        where: { vendorId },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.customerLedgerEntry.groupBy({
        by: ["customerId", "type"],
        where: { vendorId },
        _sum: { amount: true },
      }),
      prisma.vendorCustomer.count({ where: { vendorId } }),
    ]);

    const balances = new Map<string, number>();
    for (const total of customerTotals) {
      const current = balances.get(total.customerId) ?? 0;
      const amount = total._sum.amount?.toNumber() ?? 0;
      balances.set(
        total.customerId,
        Math.round((current + (total.type === "DUE" ? amount : -amount)) * 100) / 100
      );
    }

    let totalDueAmount = 0;
    let dueCustomersCount = 0;
    for (const bal of balances.values()) {
      if (bal > 0) {
        totalDueAmount += bal;
        dueCustomersCount += 1;
      }
    }

    let todaySalesAmount = 0;
    let todayProfitAmount = 0;
    for (const s of todaySales) {
      todaySalesAmount += s.totalAmount.toNumber();
      for (const it of s.items) todayProfitAmount += it.profit.toNumber();
    }

    let monthSalesAmount = 0;
    let monthProfitAmount = 0;
    for (const s of monthSales) {
      monthSalesAmount += s.totalAmount.toNumber();
      for (const it of s.items) monthProfitAmount += it.profit.toNumber();
    }

    const dayNamesBn = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহস্পতি", "শুক্র", "শনি"];
    const weeklyTrend: { day: string; date: string; amount: number; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(todayStart);
      targetDate.setDate(targetDate.getDate() - i);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const daySales = weeklySalesRecords.filter((s) => {
        const d = new Date(s.createdAt);
        return d >= targetDate && d < nextDate;
      });

      const dayTotal = daySales.reduce((sum, s) => sum + s.totalAmount.toNumber(), 0);
      weeklyTrend.push({
        day: dayNamesBn[targetDate.getDay()] || "",
        date: targetDate.toISOString().slice(0, 10),
        amount: Math.round(dayTotal * 100) / 100,
        count: daySales.length,
      });
    }

    return res.json({
      vendor: {
        name: vendor?.name || "দোকানদার",
        shopName: vendor?.shopName || "মহল্লা বাজার",
        shopOpen: vendor?.shopOpen ?? true,
      },
      metrics: {
        todaySales: Math.round(todaySalesAmount * 100) / 100,
        todayOrders: todaySales.length,
        todayProfit: Math.round(todayProfitAmount * 100) / 100,
        monthSales: Math.round(monthSalesAmount * 100) / 100,
        monthProfit: Math.round(monthProfitAmount * 100) / 100,
        totalProducts: productCount,
        totalDue: Math.round(totalDueAmount * 100) / 100,
        dueCustomersCount,
        totalCustomers: totalCustomersCount,
      },
      lowStockProducts: lowStockProducts.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock.toNumber(),
        unit: p.unit,
        price: p.price.toNumber(),
      })),
      recentSales: recentSales.map((s) => ({
        id: `#SALE-${s.id.slice(-6).toUpperCase()}`,
        saleId: s.id,
        customerName: s.customer.name,
        customerPhone: s.customer.phone,
        time: s.createdAt,
        totalAmount: s.totalAmount.toNumber(),
        paidAmount: s.paidAmount.toNumber(),
        dueAmount: s.dueAmount.toNumber(),
        itemsCount: s.items.length,
      })),
      weeklySales: weeklyTrend,
    });
  } catch (error) {
    console.error("Could not load vendor dashboard:", error);
    return res.status(500).json({ error: "ড্যাশবোর্ড ডেটা লোড করা যায়নি।" });
  }
}
