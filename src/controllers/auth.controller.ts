
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

type PublicRole = "CUSTOMER" | "VENDOR";

function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "");

  if (/^01[3-9]\d{8}$/.test(digits)) {
    return `+88${digits}`;
  }

  if (/^\+8801[3-9]\d{8}$/.test(digits)) {
    return digits;
  }

  if (/^8801[3-9]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

function createToken(userId: string): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured securely.");
  }

  return jwt.sign({ sub: userId }, secret, {
    expiresIn: "7d",
  });
}

function safeUser(user: {
  id: string;
  name: string;
  phone: string;
  role: string;
  phoneVerified: boolean;
  shopName: string | null;
  businessCategoryId: string | null;
  shopOpen: boolean;
  locationChangeRequest: unknown;
  division: string | null;
  district: string | null;
  upazila: string | null;
  unionName: string | null;
  market: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    phoneVerified: user.phoneVerified,
    shopName: user.shopName,
    businessCategoryId: user.businessCategoryId,
    shopOpen: user.shopOpen,
    locationChangeRequest: user.locationChangeRequest,
    division: user.division,
    district: user.district,
    upazila: user.upazila,
    union: user.unionName,
    market: user.market,
  };
}

// POST /api/auth/register
export async function register(req: Request, res: Response) {
  try {
    const {
      name,
      phone,
      password,
      role: requestedRole,
      shopName,
      businessCategoryId,
      division,
      district,
      upazila,
      union: unionName,
      market,
    } = req.body ?? {};

    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100 ||
      typeof phone !== "string" ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: "Valid name, phone number and password are required.",
      });
    }

    const locationValues = [
      division,
      district,
      upazila,
      unionName,
      market,
    ];
    if (
      locationValues.some(
        (value) =>
          typeof value !== "string" ||
          value.trim().length === 0 ||
          value.trim().length > 120,
      )
    ) {
      return res.status(400).json({
        error:
          "Division, district, upazila, union and market are required.",
      });
    }

    // Never permit public registration as ADMIN.
    const role: PublicRole =
      requestedRole === undefined ? "CUSTOMER" : requestedRole;

    if (role !== "CUSTOMER" && role !== "VENDOR") {
      return res.status(400).json({
        error: "Invalid account type. Choose Customer or Vendor.",
      });
    }

    if (
      role === "VENDOR" &&
      (typeof shopName !== "string" ||
        shopName.trim().length < 2 ||
        shopName.trim().length > 120)
    ) {
      return res.status(400).json({
        error: "A valid shop name is required for Vendor registration.",
      });
    }

    let vendorBusinessCategoryId: string | null = null;
    if (role === "VENDOR") {
      if (
        typeof businessCategoryId !== "string" ||
        businessCategoryId.trim().length === 0
      ) {
        return res.status(400).json({
          error: "Choose your business category for Vendor registration.",
        });
      }

      const businessCategory = await prisma.businessCategory.findFirst({
        where: { id: businessCategoryId.trim(), isActive: true },
        select: { id: true },
      });
      if (!businessCategory) {
        return res.status(400).json({
          error: "Choose an active business category.",
        });
      }
      vendorBusinessCategoryId = businessCategory.id;
    }

    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        error: "Enter a valid Bangladesh mobile number.",
      });
    }

    const existing = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existing) {
      return res.status(409).json({
        error: "Registration could not be completed with this phone number.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        phone: normalizedPhone,
        passwordHash,
        role,
        phoneVerified: false,
        shopName: role === "VENDOR" ? shopName.trim() : null,
        businessCategoryId: vendorBusinessCategoryId,
        division: division.trim(),
        district: district.trim(),
        upazila: upazila.trim(),
        unionName: unionName.trim(),
        market: market.trim(),
      },
    });

    return res.status(201).json({
      message:
        role === "VENDOR"
          ? "Vendor account created with the selected business category."
          : "Registration successful.",
      user: safeUser(user),
    });
  } catch (error) {
    // P2002 means a unique field, such as phone, already exists.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        error: "Registration could not be completed with this phone number.",
      });
    }

    console.error("Registration failed:", error);

    return res.status(500).json({
      error: "Registration failed. Please try again.",
    });
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  try {
    const { phone, password } = req.body ?? {};

    if (typeof phone !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: "Phone number and password are required.",
      });
    }

    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return res.status(401).json({
        error: "Invalid phone number or password.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Invalid phone number or password.",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        error: "This account is not currently active.",
      });
    }

    const token = createToken(user.id);

    return res.json({
      message: "Login successful.",
      token,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      error: "Login failed. Please try again.",
    });
  }
}

// POST /api/auth/logout
export async function logout(_req: Request, res: Response) {
  // The client must discard its bearer token.
  return res.json({
    message: "Logout successful. Discard your token.",
  });
}

// GET /api/auth/me
export async function me(_req: Request, res: Response) {
  const userId = res.locals.userId as string | undefined;

  if (!userId) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    return res.json({
      user: safeUser(user),
    });
  } catch (error) {
    console.error("Could not load account:", error);

    return res.status(500).json({
      error: "Could not load account.",
    });
  }
}


// GET /api/auth/invite/:token
export async function getInviteDetails(req: Request, res: Response) {
  const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) {
    return res.status(400).json({ error: "ইনভাইট টোকেন প্রয়োজন।" });
  }

  try {
    const invite = await prisma.accountLinkRequest.findUnique({
      where: { token },
      include: {
        vendor: {
          select: { shopName: true, name: true, phone: true },
        },
        vendorCustomer: {
          select: { name: true, phone: true, division: true, district: true, upazila: true, unionName: true, village: true },
        },
      },
    });

    if (!invite || invite.status !== "PENDING") {
      return res.status(404).json({ error: "এই ইনভাইট লিংকটি আর সক্রিয় নয়।" });
    }

    if (new Date() > invite.expiresAt) {
      await prisma.accountLinkRequest.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
      return res.status(410).json({ error: "এই ইনভাইট লিংকের মেয়াদ শেষ হয়ে গেছে।" });
    }

    return res.json({
      valid: true,
      customerName: invite.vendorCustomer.name,
      customerPhone: invite.customerPhone,
      shopName: invite.vendor.shopName || invite.vendor.name,
      vendorName: invite.vendor.name,
    });
  } catch (error) {
    console.error("Could not load invite details:", error);
    return res.status(500).json({ error: "ইনভাইট যাচাই করা যায়নি।" });
  }
}

// POST /api/auth/setup-account
export async function setupCustomerAccount(req: Request, res: Response) {
  const { token, password, confirmPassword } = req.body ?? {};

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "ইনভাইট টোকেন প্রয়োজন।" });
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    return res.status(400).json({ error: "পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।" });
  }

  try {
    const invite = await prisma.accountLinkRequest.findUnique({
      where: { token: token.trim() },
      include: {
        vendorCustomer: true,
      },
    });

    if (!invite || invite.status !== "PENDING") {
      return res.status(404).json({ error: "এই ইনভাইট লিংকটি আর সক্রিয় নয়।" });
    }

    if (new Date() > invite.expiresAt) {
      return res.status(410).json({ error: "এই ইনভাইট লিংকের মেয়াদ শেষ হয়ে গেছে।" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user = await prisma.user.findUnique({
      where: { phone: invite.customerPhone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: invite.vendorCustomer.name,
          phone: invite.customerPhone,
          passwordHash,
          role: "CUSTOMER",
          phoneVerified: false,
          division: invite.vendorCustomer.division,
          district: invite.vendorCustomer.district,
          upazila: invite.vendorCustomer.upazila,
          unionName: invite.vendorCustomer.unionName,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          role: "CUSTOMER",
        },
      });
    }

    await prisma.$transaction([
      prisma.vendorCustomer.updateMany({
        where: {
          OR: [
            { id: invite.vendorCustomerId },
            { phone: invite.customerPhone },
          ],
        },
        data: { linkedUserId: user.id },
      }),
      prisma.accountLinkRequest.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED" },
      }),
    ]);

    const authToken = createToken(user.id);

    return res.status(200).json({
      message: "অ্যাকাউন্ট সফলভাবে প্রস্তুত হয়েছে।",
      token: authToken,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("Account setup failed:", error);
    return res.status(500).json({ error: "অ্যাকাউন্ট তৈরি সম্পন্ন করা যায়নি।" });
  }
}
