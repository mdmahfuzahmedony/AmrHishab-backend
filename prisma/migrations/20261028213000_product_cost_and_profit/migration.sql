-- AlterTable Product: add costPrice
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable SaleItem: add costPrice and profit
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "profit" DECIMAL(12,2) NOT NULL DEFAULT 0;
