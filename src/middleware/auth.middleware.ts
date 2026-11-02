import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    return res.status(500).json({
      error: "Authentication is not configured.",
    });
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret);
  } catch (error) {
    const message =
      error instanceof jwt.TokenExpiredError
        ? "Your session has expired. Please sign in again."
        : "Invalid authentication token. Please sign in again.";
    return res.status(401).json({ error: message });
  }

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    return res.status(401).json({
      error: "Invalid or expired token.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true },
    });

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired token.",
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        error: "This account is not currently active.",
      });
    }

    res.locals.userId = user.id;
    return next();
  } catch (error) {
    console.error("Could not verify account status:", error);
    return res.status(500).json({
      error: "Could not verify account status.",
    });
  }
}

export async function requireVendor(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const vendorId = res.locals.userId as string | undefined;
  if (!vendorId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: { role: true },
    });

    if (!vendor || vendor.role !== "VENDOR") {
      return res.status(403).json({ error: "Vendor access required." });
    }

    return next();
  } catch (error) {
    console.error("Could not verify vendor access:", error);
    return res.status(500).json({ error: "Could not verify vendor access." });
  }
}

export async function requireCustomer(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const customerId = res.locals.userId as string | undefined;
  if (!customerId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { role: true },
    });

    if (!customer || customer.role !== "CUSTOMER") {
      return res.status(403).json({ error: "Customer access required." });
    }

    return next();
  } catch (error) {
    console.error("Could not verify customer access:", error);
    return res.status(500).json({ error: "Could not verify customer access." });
  }
}
