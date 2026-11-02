CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_vendorId_name_key" ON "Category"("vendorId", "name");
CREATE UNIQUE INDEX "Category_id_vendorId_key" ON "Category"("id", "vendorId");
CREATE INDEX "Category_vendorId_createdAt_idx" ON "Category"("vendorId", "createdAt");
CREATE INDEX "Product_vendorId_categoryId_idx" ON "Product"("vendorId", "categoryId");
CREATE INDEX "Product_vendorId_isActive_idx" ON "Product"("vendorId", "isActive");

ALTER TABLE "Category" ADD CONSTRAINT "Category_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_vendorId_fkey"
    FOREIGN KEY ("categoryId", "vendorId") REFERENCES "Category"("id", "vendorId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
