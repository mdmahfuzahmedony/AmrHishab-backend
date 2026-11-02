ALTER TABLE "User"
ADD COLUMN "deliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deliveryFee" DECIMAL(10, 2),
ADD COLUMN "deliveryNote" TEXT;
