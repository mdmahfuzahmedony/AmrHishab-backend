import type { Request, Response } from "express";
import { UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

type CategoryInput = {
  name: string;
  englishName: string;
  description: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const requesterId = res.locals.userId as string | undefined;
  if (!requesterId) {
    res.status(401).json({ error: "Authentication required." });
    return false;
  }

  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });
    if (!requester || requester.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Admin access required." });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Could not verify admin access for business categories:", error);
    res.status(500).json({ error: "Could not verify admin access." });
    return false;
  }
}

function getCategoryInput(body: unknown): CategoryInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const input = body as Record<string, unknown>;
  const { name, englishName, description, icon, sortOrder, isActive } = input;

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 100 ||
    typeof englishName !== "string" ||
    englishName.trim().length === 0 ||
    englishName.trim().length > 100 ||
    typeof description !== "string" ||
    description.trim().length > 500 ||
    typeof icon !== "string" ||
    icon.trim().length === 0 ||
    icon.trim().length > 80 ||
    typeof sortOrder !== "number" ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    (isActive !== undefined && typeof isActive !== "boolean")
  ) {
    return null;
  }

  return {
    name: name.trim(),
    englishName: englishName.trim(),
    description: description.trim(),
    icon: icon.trim(),
    sortOrder,
    isActive: isActive === undefined ? true : isActive,
  };
}

function getRouteId(req: Request, param: string): string | null {
  const id = req.params[param];
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function listActiveBusinessCategories(
  _req: Request,
  res: Response,
) {
  try {
    const categories = await prisma.businessCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        englishName: true,
        description: true,
        icon: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return res.json({ categories });
  } catch (error) {
    console.error("Could not load active business categories:", error);
    return res.status(500).json({ error: "Could not load business categories." });
  }
}

export async function getActiveBusinessCategory(req: Request, res: Response) {
  const id = getRouteId(req, "id");
  if (!id) {
    return res.status(400).json({ error: "A valid category ID is required." });
  }

  try {
    const category = await prisma.businessCategory.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        name: true,
        englishName: true,
        description: true,
        icon: true,
        sortOrder: true,
      },
    });
    if (!category) {
      return res.status(404).json({ error: "Business category was not found." });
    }
    return res.json({ category });
  } catch (error) {
    console.error("Could not load business category:", error);
    return res.status(500).json({ error: "Could not load business category." });
  }
}

export async function listAdminBusinessCategories(
  req: Request,
  res: Response,
) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const categories = await prisma.businessCategory.findMany({
      include: { _count: { select: { vendors: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return res.json({
      categories: categories.map(({ _count, ...category }) => ({
        ...category,
        vendorCount: _count.vendors,
      })),
    });
  } catch (error) {
    console.error("Could not load admin business categories:", error);
    return res.status(500).json({ error: "Could not load business categories." });
  }
}

export async function createBusinessCategory(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  const input = getCategoryInput(req.body);
  if (!input) {
    return res.status(400).json({ error: "Enter valid business category details." });
  }

  try {
    const category = await prisma.businessCategory.create({
      data: input,
    });
    return res.status(201).json({ category });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: "A category with this name already exists." });
    }
    console.error("Could not create business category:", error);
    return res.status(500).json({ error: "Could not create business category." });
  }
}

export async function updateBusinessCategory(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  const id = getRouteId(req, "id");
  const input = getCategoryInput(req.body);
  if (!id || !input) {
    return res.status(400).json({ error: "Enter valid business category details." });
  }

  try {
    const category = await prisma.businessCategory.update({
      where: { id },
      data: input,
    });
    return res.json({ category });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: "A category with this name already exists." });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Business category was not found." });
    }
    console.error("Could not update business category:", error);
    return res.status(500).json({ error: "Could not update business category." });
  }
}

export async function updateBusinessCategoryStatus(
  req: Request,
  res: Response,
) {
  if (!(await requireAdmin(req, res))) return;
  const id = getRouteId(req, "id");
  const { isActive } = req.body ?? {};
  if (!id || typeof isActive !== "boolean") {
    return res.status(400).json({ error: "Choose an active or inactive status." });
  }

  try {
    const category = await prisma.businessCategory.update({
      where: { id },
      data: { isActive },
    });
    return res.json({ category });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Business category was not found." });
    }
    console.error("Could not update business category status:", error);
    return res.status(500).json({ error: "Could not update category status." });
  }
}

export async function deleteBusinessCategory(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  const id = getRouteId(req, "id");
  if (!id) {
    return res.status(400).json({ error: "A valid category ID is required." });
  }

  try {
    const category = await prisma.businessCategory.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { vendors: true } },
      },
    });
    if (!category) {
      return res.status(404).json({ error: "Business category was not found." });
    }
    if (category._count.vendors > 0) {
      return res.status(409).json({
        error: "This category is assigned to vendors. Deactivate it instead.",
      });
    }

    await prisma.businessCategory.delete({ where: { id } });
    return res.json({ message: "Business category deleted." });
  } catch (error) {
    console.error("Could not delete business category:", error);
    return res.status(500).json({ error: "Could not delete business category." });
  }
}

export async function updateVendorBusinessCategory(
  req: Request,
  res: Response,
) {
  if (!(await requireAdmin(req, res))) return;
  const vendorId = getRouteId(req, "userId");
  const categoryId =
    typeof req.body?.businessCategoryId === "string"
      ? req.body.businessCategoryId.trim()
      : "";
  if (!vendorId || !categoryId) {
    return res.status(400).json({ error: "A vendor and business category are required." });
  }

  try {
    const [vendor, category] = await Promise.all([
      prisma.user.findUnique({
        where: { id: vendorId },
        select: { id: true, role: true },
      }),
      prisma.businessCategory.findFirst({
        where: { id: categoryId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!vendor || vendor.role !== UserRole.VENDOR) {
      return res.status(404).json({ error: "Vendor account was not found." });
    }
    if (!category) {
      return res.status(400).json({ error: "Choose an active business category." });
    }

    const updatedVendor = await prisma.user.update({
      where: { id: vendorId },
      data: { businessCategoryId: categoryId },
      select: {
        id: true,
        businessCategory: {
          select: { id: true, name: true, englishName: true },
        },
      },
    });
    return res.json({ vendor: updatedVendor });
  } catch (error) {
    console.error("Could not update vendor business category:", error);
    return res.status(500).json({ error: "Could not update vendor business category." });
  }
}
