import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listPublicShops(req: Request, res: Response) {
  try {
    const { search, district, upazila } = req.query;

    const where: any = {
      role: "VENDOR",
    };

    if (typeof search === "string" && search.trim()) {
      const q = search.trim();
      where.OR = [
        { shopName: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { market: { contains: q, mode: "insensitive" } },
      ];
    }

    if (typeof district === "string" && district.trim()) {
      where.district = { equals: district.trim(), mode: "insensitive" };
    }

    if (typeof upazila === "string" && upazila.trim()) {
      where.upazila = { equals: upazila.trim(), mode: "insensitive" };
    }

    const vendors = await prisma.user.findMany({
      where,
      select: {
        id: true,
        shopName: true,
        name: true,
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

    const unionSet = new Set<string>();
    for (const v of vendors) {
      if (v.unionName && v.unionName.trim()) {
        unionSet.add(v.unionName.trim());
      }
    }

    const shops = vendors.map((v) => ({
      id: v.id,
      shopName: v.shopName || v.name,
      ownerName: v.name,
      phone: v.phone,
      market: v.market || "মহল্লা বাজার",
      location: [v.market, v.unionName, v.upazila, v.district]
        .filter(Boolean)
        .join(", "),
      division: v.division,
      district: v.district,
      upazila: v.upazila,
      unionName: v.unionName,
      businessCategory: v.businessCategory,
      productCount: v._count.products,
      categoryCount: v._count.categories,
      shopOpen: v.shopOpen,
      deliveryAvailable: v.deliveryAvailable,
      deliveryFee: v.deliveryFee ? Number(v.deliveryFee) : null,
      deliveryNote: v.deliveryNote,
    }));

    return res.json({
      shops,
      availableUnions: Array.from(unionSet),
    });
  } catch (error) {
    console.error("Could not list public shops:", error);
    return res.status(500).json({ error: "দোকানের তালিকা লোড করা যায়নি।" });
  }
}

export async function getPublicShopDetails(req: Request, res: Response) {
  const shopId = typeof req.params.shopId === "string" ? req.params.shopId : "";
  if (!shopId) {
    return res.status(400).json({ error: "দোকানের আইডি প্রয়োজন।" });
  }

  try {
    const vendor = await prisma.user.findFirst({
      where: {
        id: shopId,
        role: "VENDOR",
      },
      select: {
        id: true,
        shopName: true,
        name: true,
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
      },
    });

    if (!vendor) {
      return res.status(404).json({ error: "দোকানটি খুঁজে পাওয়া যায়নি।" });
    }

    const categories = await prisma.category.findMany({
      where: {
        vendorId: vendor.id,
        products: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: { products: { where: { isActive: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    const products = await prisma.product.findMany({
      where: {
        vendorId: vendor.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        unit: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return res.json({
      shop: {
        id: vendor.id,
        shopName: vendor.shopName || vendor.name,
        ownerName: vendor.name,
        phone: vendor.phone,
        market: vendor.market || "মহল্লা বাজার",
        location: [vendor.market, vendor.unionName, vendor.upazila, vendor.district]
          .filter(Boolean)
          .join(", "),
        division: vendor.division,
        district: vendor.district,
        upazila: vendor.upazila,
        businessCategory: vendor.businessCategory,
        totalProducts: products.length,
        shopOpen: vendor.shopOpen,
        deliveryAvailable: vendor.deliveryAvailable,
        deliveryFee: vendor.deliveryFee ? Number(vendor.deliveryFee) : null,
        deliveryNote: vendor.deliveryNote,
      },
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        count: c._count.products,
      })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: Number(p.stock),
        unit: p.unit,
        inStock: Number(p.stock) > 0,
        categoryId: p.categoryId,
        categoryName: p.category.name,
      })),
    });
  } catch (error) {
    console.error("Could not fetch shop details:", error);
    return res.status(500).json({ error: "দোকানের বিস্তারিত তথ্য পাওয়া যায়নি।" });
  }
}
