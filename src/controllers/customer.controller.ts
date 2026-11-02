import type { Request, Response } from "express";
import { LedgerEntryType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

function getCustomerId(res: Response): string | null {
  return (res.locals.userId as string | undefined) ?? null;
}

export async function getCustomerDashboard(_req: Request, res: Response) {
  const customerUserId = getCustomerId(res);
  if (!customerUserId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: customerUserId },
      select: { id: true, name: true, phone: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Account not found." });
    }

    // Find all vendorCustomer records linked to this user, OR matching the phone
    const vendorCustomers = await prisma.vendorCustomer.findMany({
      where: {
        OR: [
          { linkedUserId: user.id },
          { phone: user.phone },
        ],
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            shopName: true,
            phone: true,
            market: true,
            district: true,
            upazila: true,
            unionName: true,
          },
        },
      },
    });

    // Auto-link any unlinked vendorCustomer records that have this phone
    const unlinkedIds = vendorCustomers
      .filter((vc) => !vc.linkedUserId)
      .map((vc) => vc.id);
    if (unlinkedIds.length > 0) {
      await prisma.vendorCustomer.updateMany({
        where: { id: { in: unlinkedIds } },
        data: { linkedUserId: user.id },
      });
    }

    const customerIds = vendorCustomers.map((vc) => vc.id);

    if (customerIds.length === 0) {
      return res.json({
        totalBalance: 0,
        totalPurchases: 0,
        totalPayments: 0,
        shopCount: 0,
        shops: [],
        recentTransactions: [],
      });
    }

    // Load ledger entries
    const [entries, totals] = await Promise.all([
      prisma.customerLedgerEntry.findMany({
        where: { customerId: { in: customerIds } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          vendor: {
            select: { shopName: true, name: true },
          },
        },
      }),
      prisma.customerLedgerEntry.groupBy({
        by: ["customerId", "type"],
        where: { customerId: { in: customerIds } },
        _sum: { amount: true },
      }),
    ]);

    const shopBalances = new Map<string, number>();
    let totalPurchases = 0;
    let totalPayments = 0;

    for (const item of totals) {
      const amount = item._sum.amount?.toNumber() ?? 0;
      const current = shopBalances.get(item.customerId) ?? 0;
      if (item.type === LedgerEntryType.DUE) {
        totalPurchases += amount;
        shopBalances.set(item.customerId, current + amount);
      } else {
        totalPayments += amount;
        shopBalances.set(item.customerId, current - amount);
      }
    }

    const totalBalance = Math.round((totalPurchases - totalPayments) * 100) / 100;

    const shops = vendorCustomers.map((vc) => {
      const bal = Math.round((shopBalances.get(vc.id) ?? 0) * 100) / 100;
      return {
        id: vc.id,
        vendorId: vc.vendor.id,
        shopName: vc.vendor.shopName || vc.vendor.name,
        vendorName: vc.vendor.name,
        vendorPhone: vc.vendor.phone,
        market: vc.vendor.market,
        district: vc.vendor.district,
        upazila: vc.vendor.upazila,
        union: vc.vendor.unionName,
        balance: bal,
      };
    });

    const recentTransactions = entries.map((entry) => ({
      id: entry.id,
      shopName: entry.vendor.shopName || entry.vendor.name,
      type: entry.type,
      amount: entry.amount.toNumber(),
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
    }));

    return res.json({
      totalBalance,
      totalPurchases: Math.round(totalPurchases * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      shopCount: shops.length,
      shops,
      recentTransactions,
    });
  } catch (error) {
    console.error("Could not load customer dashboard:", error);
    return res.status(500).json({ error: "ড্যাশবোর্ড তথ্য লোড করা যায়নি।" });
  }
}

export async function getCustomerShops(_req: Request, res: Response) {
  const customerUserId = getCustomerId(res);
  if (!customerUserId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: customerUserId },
      select: {
        id: true,
        phone: true,
        name: true,
        division: true,
        district: true,
        upazila: true,
        unionName: true,
        market: true,
      },
    });

    if (!user) return res.status(401).json({ error: "Account not found." });

    // 1. Fetch vendorCustomers for this user (to get khata ledger balances)
    const vendorCustomers = await prisma.vendorCustomer.findMany({
      where: {
        OR: [{ linkedUserId: user.id }, { phone: user.phone }],
      },
      select: {
        id: true,
        vendorId: true,
      },
    });

    const customerIds = vendorCustomers.map((vc) => vc.id);
    const totals =
      customerIds.length > 0
        ? await prisma.customerLedgerEntry.groupBy({
            by: ["customerId", "type"],
            where: { customerId: { in: customerIds } },
            _sum: { amount: true },
          })
        : [];

    const balancesByCustomerId = new Map<string, number>();
    for (const t of totals) {
      const amount = t._sum.amount?.toNumber() ?? 0;
      const cur = balancesByCustomerId.get(t.customerId) ?? 0;
      balancesByCustomerId.set(
        t.customerId,
        cur + (t.type === LedgerEntryType.DUE ? amount : -amount),
      );
    }

    const balancesByVendorId = new Map<string, number>();
    const linkedVendorMap = new Map<string, string>(); // vendorId -> customerId
    for (const vc of vendorCustomers) {
      const bal = balancesByCustomerId.get(vc.id) ?? 0;
      balancesByVendorId.set(vc.vendorId, bal);
      linkedVendorMap.set(vc.vendorId, vc.id);
    }

    // 2. Fetch all active shops/vendors from the database
    const vendors = await prisma.user.findMany({
      where: {
        role: "VENDOR",
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        shopName: true,
        phone: true,
        market: true,
        division: true,
        district: true,
        upazila: true,
        unionName: true,
        shopOpen: true,
        deliveryAvailable: true,
        deliveryFee: true,
        deliveryNote: true,
        businessCategory: {
          select: { id: true, name: true, englishName: true },
        },
        createdAt: true,
        _count: {
          select: {
            products: { where: { isActive: true } },
            categories: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Format shops with real area matching
    const shops = vendors.map((v) => {
      const hasKhata = linkedVendorMap.has(v.id);
      const balance = Math.round((balancesByVendorId.get(v.id) ?? 0) * 100) / 100;

      const isMyUnion = Boolean(
        user.unionName &&
          v.unionName &&
          v.unionName.trim().toLowerCase() === user.unionName.trim().toLowerCase(),
      );

      const isMyUpazila = Boolean(
        user.upazila &&
          v.upazila &&
          v.upazila.trim().toLowerCase() === user.upazila.trim().toLowerCase(),
      );

      return {
        id: v.id,
        vendorId: v.id,
        customerId: linkedVendorMap.get(v.id) || null,
        shopName: v.shopName || v.name,
        vendorName: v.name,
        vendorPhone: v.phone,
        market: v.market || "মহল্লা বাজার",
        division: v.division,
        district: v.district,
        upazila: v.upazila,
        unionName: v.unionName,
        businessCategory: v.businessCategory,
        location: [v.market, v.unionName, v.upazila, v.district]
          .filter(Boolean)
          .join(", "),
        productCount: v._count.products,
        categoryCount: v._count.categories,
        hasKhata,
        balance,
        isMyUnion,
        isMyUpazila,
        shopOpen: v.shopOpen,
        deliveryAvailable: v.deliveryAvailable,
        deliveryFee: v.deliveryFee ? Number(v.deliveryFee) : null,
        deliveryNote: v.deliveryNote,
      };
    });

    // Collect list of distinct available unions
    const unionSet = new Set<string>();
    for (const v of vendors) {
      if (v.unionName && v.unionName.trim()) {
        unionSet.add(v.unionName.trim());
      }
    }

    return res.json({
      customerArea: {
        name: user.name,
        phone: user.phone,
        division: user.division,
        district: user.district,
        upazila: user.upazila,
        unionName: user.unionName,
        market: user.market,
      },
      defaultUnion: user.unionName || "",
      availableUnions: Array.from(unionSet),
      shops,
    });
  } catch (error) {
    console.error("Could not load customer shops:", error);
    return res.status(500).json({ error: "দোকানের তালিকা লোড করা যায়নি।" });
  }
}

export async function getCustomerTransactions(_req: Request, res: Response) {
  const customerUserId = getCustomerId(res);
  if (!customerUserId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: customerUserId },
      select: { id: true, phone: true },
    });

    if (!user) return res.status(401).json({ error: "Account not found." });

    const vendorCustomers = await prisma.vendorCustomer.findMany({
      where: {
        OR: [{ linkedUserId: user.id }, { phone: user.phone }],
      },
      select: { id: true },
    });

    const customerIds = vendorCustomers.map((vc) => vc.id);
    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: { createdAt: "desc" },
      include: {
        vendor: {
          select: { shopName: true, name: true, phone: true },
        },
        sale: {
          include: {
            items: true,
          },
        },
      },
    });

    return res.json({
      transactions: entries.map((entry) => ({
        id: entry.id,
        shopName: entry.vendor.shopName || entry.vendor.name,
        shopPhone: entry.vendor.phone,
        type: entry.type,
        amount: entry.amount.toNumber(),
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
        sale: entry.sale
          ? {
              id: entry.sale.id,
              totalAmount: entry.sale.totalAmount.toNumber(),
              paidAmount: entry.sale.paidAmount.toNumber(),
              dueAmount: entry.sale.dueAmount.toNumber(),
              dueDate: entry.sale.dueDate?.toISOString() ?? null,
              items: entry.sale.items.map((it) => ({
                id: it.id,
                name: it.name,
                quantity: it.quantity.toNumber(),
                unitPrice: it.unitPrice.toNumber(),
                totalPrice: it.totalPrice.toNumber(),
                unit: it.unit,
              })),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Could not load customer transactions:", error);
    return res.status(500).json({ error: "লেনদেনের তালিকা লোড করা যায়নি।" });
  }
}
