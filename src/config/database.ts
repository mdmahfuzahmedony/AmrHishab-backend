import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!prisma) {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      }),
    });
  }

  return prisma;
}
