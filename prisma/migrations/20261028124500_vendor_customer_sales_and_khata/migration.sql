-- CreateEnum
CREATE TYPE "LinkRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "VendorCustomer"
  ADD COLUMN "division" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "upazila" TEXT,
  ADD COLUMN "unionName" TEXT,
  ADD COLUMN "village" TEXT,
  ADD COLUMN "linkedUserId" TEXT,
  ALTER COLUMN "address" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CustomerLedgerEntry"
  ADD COLUMN "saleId" TEXT;

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountLinkRequest" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorCustomerId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "LinkRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorCustomer_vendorId_phone_key" ON "VendorCustomer"("vendorId", "phone");

-- CreateIndex
CREATE INDEX "VendorCustomer_vendorId_phone_idx" ON "VendorCustomer"("vendorId", "phone");

-- CreateIndex
CREATE INDEX "VendorCustomer_linkedUserId_idx" ON "VendorCustomer"("linkedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedgerEntry_saleId_key" ON "CustomerLedgerEntry"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_id_vendorId_key" ON "Sale"("id", "vendorId");

-- CreateIndex
CREATE INDEX "Sale_vendorId_customerId_createdAt_idx" ON "Sale"("vendorId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountLinkRequest_token_key" ON "AccountLinkRequest"("token");

-- CreateIndex
CREATE INDEX "AccountLinkRequest_customerPhone_status_idx" ON "AccountLinkRequest"("customerPhone", "status");

-- CreateIndex
CREATE INDEX "AccountLinkRequest_vendorId_vendorCustomerId_idx" ON "AccountLinkRequest"("vendorId", "vendorCustomerId");

-- AddForeignKey
ALTER TABLE "VendorCustomer" ADD CONSTRAINT "VendorCustomer_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_vendorId_fkey" FOREIGN KEY ("customerId", "vendorId") REFERENCES "VendorCustomer"("id", "vendorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLinkRequest" ADD CONSTRAINT "AccountLinkRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLinkRequest" ADD CONSTRAINT "AccountLinkRequest_vendorCustomerId_vendorId_fkey" FOREIGN KEY ("vendorCustomerId", "vendorId") REFERENCES "VendorCustomer"("id", "vendorId") ON DELETE CASCADE ON UPDATE CASCADE;
