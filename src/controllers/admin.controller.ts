import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

const PAGE_SIZE = 50;

function getTargetUserId(req: Request): string | null {
  const userId = req.params.userId;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

export async function getDashboard(req: Request, res: Response) {
  const requesterId = res.locals.userId as string | undefined;

  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const chartStart = new Date(today);
    chartStart.setUTCDate(chartStart.getUTCDate() - 6);

    const [
      totalUsers,
      customers,
      vendors,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      weeklyRegistrations,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      prisma.user.count({ where: { role: UserRole.VENDOR } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "PENDING" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.user.findMany({
        where: { createdAt: { gte: chartStart } },
        select: { createdAt: true },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    const registrationCounts = new Map<string, number>();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(chartStart);
      date.setUTCDate(date.getUTCDate() + offset);
      registrationCounts.set(date.toISOString().slice(0, 10), 0);
    }

    for (const registration of weeklyRegistrations) {
      const date = registration.createdAt.toISOString().slice(0, 10);
      registrationCounts.set(date, (registrationCounts.get(date) ?? 0) + 1);
    }

    return res.json({
      totals: {
        users: totalUsers,
        customers,
        vendors,
        active: activeUsers,
        pending: pendingUsers,
        suspended: suspendedUsers,
      },
      registrations: Array.from(registrationCounts, ([date, count]) => ({
        date,
        count,
      })),
      recentUsers,
    });
  } catch (error) {
    console.error("Could not load admin dashboard:", error);
    return res.status(500).json({ error: "Could not load dashboard data." });
  }
}

export async function listUsers(req: Request, res: Response) {
  const requesterId = res.locals.userId as string | undefined;

  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const requestedPage = Number(req.query.page ?? 1);
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {};

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          status: true,
          phoneVerified: true,
          division: true,
          district: true,
          upazila: true,
          unionName: true,
          market: true,
          businessCategory: {
            select: { id: true, name: true, englishName: true },
          },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return res.json({
      users: users.map(({ unionName, ...user }) => ({
        ...user,
        union: unionName,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("Could not load admin user list:", error);
    return res.status(500).json({ error: "Could not load user list." });
  }
}

export async function listShops(req: Request, res: Response) {
  const requesterId = res.locals.userId as string | undefined;

  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const requestedPage = Number(req.query.page ?? 1);
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where = {
      role: UserRole.VENDOR,
      ...(req.query.locationRequestsOnly === "true"
        ? { locationChangeRequest: { not: Prisma.DbNull } }
        : {}),
      ...(search
        ? {
            OR: [
              { shopName: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { district: { contains: search, mode: "insensitive" as const } },
              { market: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, vendors] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          shopName: true,
          phone: true,
          status: true,
          phoneVerified: true,
          shopOpen: true,
          locationChangeRequest: true,
          division: true,
          district: true,
          upazila: true,
          unionName: true,
          market: true,
          businessCategory: {
            select: { id: true, name: true, englishName: true },
          },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return res.json({
      shops: vendors.map(({ unionName, ...vendor }) => ({
        ...vendor,
        union: unionName,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("Could not load admin shop list:", error);
    return res.status(500).json({ error: "Could not load shop list." });
  }
}

export async function listVendorLocationRequests(
  _req: Request,
  res: Response,
) {
  const requesterId = res.locals.userId as string | undefined;
  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });
    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const pendingWhere = {
      role: UserRole.VENDOR,
      locationChangeRequest: { not: Prisma.DbNull },
    };
    const [pendingTotal, requests] = await prisma.$transaction([
      prisma.user.count({ where: pendingWhere }),
      prisma.user.findMany({
        where: pendingWhere,
        select: {
          id: true,
          name: true,
          shopName: true,
          locationChangeRequest: true,
        },
        orderBy: { updatedAt: "desc" },
        take: PAGE_SIZE,
      }),
    ]);

    const notifications = requests.flatMap((vendor) => {
      const request = vendor.locationChangeRequest;
      if (typeof request !== "object" || request === null || Array.isArray(request)) {
        return [];
      }

      const location = request as Record<string, unknown>;
      const fields = ["division", "district", "upazila", "union", "market"];
      if (
        fields.some(
          (field) =>
            typeof location[field] !== "string" ||
            location[field].trim().length === 0,
        )
      ) {
        return [];
      }

      return [{
        id: vendor.id,
        name: vendor.name,
        shopName: vendor.shopName,
        location: {
          division: location.division,
          district: location.district,
          upazila: location.upazila,
          union: location.union,
          market: location.market,
        },
        requestedAt:
          typeof location.requestedAt === "string" ? location.requestedAt : null,
      }];
    });

    return res.json({
      requests: notifications,
      total: pendingTotal,
    });
  } catch (error) {
    console.error("Could not load vendor location requests:", error);
    return res.status(500).json({ error: "Could not load location requests." });
  }
}

export async function reviewVendorLocationRequest(
  req: Request,
  res: Response,
) {
  const requesterId = res.locals.userId as string | undefined;
  const vendorId = getTargetUserId(req);
  const action = req.body?.action;

  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!vendorId) {
    return res.status(400).json({ error: "A valid user ID is required." });
  }
  if (action !== "APPROVE" && action !== "REJECT") {
    return res.status(400).json({ error: "Choose APPROVE or REJECT." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });
    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: { role: true, locationChangeRequest: true },
    });
    if (!vendor || vendor.role !== UserRole.VENDOR) {
      return res.status(404).json({ error: "Vendor account was not found." });
    }

    const request = vendor.locationChangeRequest;
    if (
      typeof request !== "object" ||
      request === null ||
      Array.isArray(request)
    ) {
      return res.status(409).json({ error: "No pending location request." });
    }

    const location = request as Record<string, unknown>;
    const fields = ["division", "district", "upazila", "union", "market"];
    if (
      fields.some(
        (field) =>
          typeof location[field] !== "string" ||
          (location[field] as string).trim().length === 0,
      )
    ) {
      return res.status(409).json({ error: "Pending location request is invalid." });
    }

    const updatedVendor = await prisma.user.update({
      where: { id: vendorId },
      data:
        action === "APPROVE"
          ? {
              division: location.division as string,
              district: location.district as string,
              upazila: location.upazila as string,
              unionName: location.union as string,
              market: location.market as string,
              locationChangeRequest: Prisma.DbNull,
            }
          : { locationChangeRequest: Prisma.DbNull },
      select: {
        id: true,
        division: true,
        district: true,
        upazila: true,
        unionName: true,
        market: true,
      },
    });

    return res.json({
      action,
      user: {
        ...updatedVendor,
        union: updatedVendor.unionName,
      },
    });
  } catch (error) {
    console.error("Could not review vendor location request:", error);
    return res.status(500).json({ error: "Could not review location request." });
  }
}

export async function updateVendorStatus(req: Request, res: Response) {
  const requesterId = res.locals.userId as string | undefined;

  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const status = req.body?.status;
  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    return res.status(400).json({
      error: "Choose ACTIVE or SUSPENDED as the vendor status.",
    });
  }

  const targetUserId = getTargetUserId(req);
  if (!targetUserId) {
    return res.status(400).json({ error: "A valid user ID is required." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const vendor = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!vendor) {
      return res.status(404).json({ error: "User account was not found." });
    }

    if (vendor.role !== UserRole.VENDOR) {
      return res.status(400).json({ error: "Only vendor accounts can be changed here." });
    }

    const updatedVendor = await prisma.user.update({
      where: { id: vendor.id },
      data: { status },
      select: { id: true, status: true },
    });

    return res.json({ user: updatedVendor });
  } catch (error) {
    console.error("Could not update vendor status:", error);
    return res.status(500).json({ error: "Could not update vendor status." });
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

export async function deleteVendor(req: Request, res: Response) {
  const requesterId = res.locals.userId as string | undefined;

  if (!requesterId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const targetUserId = getTargetUserId(req);
  if (!targetUserId) {
    return res.status(400).json({ error: "A valid user ID is required." });
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    if (!requester || requester.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const vendor = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!vendor) {
      return res.status(404).json({ error: "User account was not found." });
    }

    if (vendor.role !== UserRole.VENDOR) {
      return res.status(400).json({ error: "Only vendor accounts can be deleted here." });
    }

    await prisma.user.delete({ where: { id: vendor.id } });

    return res.json({ message: "Vendor account deleted." });
  } catch (error) {
    console.error("Could not delete vendor account:", error);
    return res.status(500).json({ error: "Could not delete vendor account." });
  }
}
