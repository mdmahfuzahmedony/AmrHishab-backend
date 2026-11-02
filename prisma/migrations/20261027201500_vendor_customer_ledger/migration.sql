CREATE TYPE "LedgerEntryType" AS ENUM ('DUE', 'PAYMENT');

CREATE TABLE "VendorCustomer" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerLedgerEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorCustomer_id_vendorId_key" ON "VendorCustomer"("id", "vendorId");
CREATE INDEX "VendorCustomer_vendorId_name_idx" ON "VendorCustomer"("vendorId", "name");
CREATE INDEX "CustomerLedgerEntry_vendorId_customerId_createdAt_idx"
    ON "CustomerLedgerEntry"("vendorId", "customerId", "createdAt");

ALTER TABLE "VendorCustomer" ADD CONSTRAINT "VendorCustomer_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_vendorId_fkey"
    FOREIGN KEY ("customerId", "vendorId") REFERENCES "VendorCustomer"("id", "vendorId")
    ON DELETE CASCADE ON UPDATE CASCADE;
