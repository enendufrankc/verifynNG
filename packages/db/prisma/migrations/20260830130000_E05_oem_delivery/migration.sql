-- E05 OEM Manifest Delivery — additive migration.

-- Membership.role gets a new external-party value. RolesGuard already falls back to
-- treating an unrecognised role string as its own allowed set, so no other E02 code changes.
ALTER TYPE "TenantRole" ADD VALUE IF NOT EXISTS 'oem';

-- Batch.expectedShipDate: written by E05 at delivery time, read by E07 in one join.
ALTER TABLE "Batch" ADD COLUMN "expectedShipDate" TIMESTAMP(3);

CREATE TYPE "DeliveryStatus" AS ENUM ('delivered', 'downloaded', 'receipted', 'revoked', 'expired');

CREATE TABLE "OemUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OemUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManifestDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "oemId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "signatureKid" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER NOT NULL DEFAULT 5,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "expectedShipDate" TIMESTAMP(3),
    "status" "DeliveryStatus" NOT NULL DEFAULT 'delivered',
    "deliveredById" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ManifestDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManifestDownload" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "oemUserId" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManifestDownload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrintReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "oemUserId" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "expectedHash" TEXT NOT NULL,
    "codeCount" INTEGER NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "watermarks" TEXT[],
    "expectedWatermark" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "mismatchReason" TEXT,
    "mismatchDetail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "oemId" TEXT NOT NULL,
    "oemUserId" TEXT NOT NULL,
    "carrier" TEXT,
    "trackingRef" TEXT,
    "shippedAt" TIMESTAMP(3) NOT NULL,
    "expectedArrivalAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OemUser_userId_key" ON "OemUser"("userId");
CREATE INDEX "OemUser_tenantId_oemId_idx" ON "OemUser"("tenantId", "oemId");

CREATE INDEX "ManifestDelivery_tenantId_batchId_idx" ON "ManifestDelivery"("tenantId", "batchId");
CREATE INDEX "ManifestDelivery_oemId_status_idx" ON "ManifestDelivery"("oemId", "status");

CREATE INDEX "ManifestDownload_deliveryId_createdAt_idx" ON "ManifestDownload"("deliveryId", "createdAt");

CREATE INDEX "PrintReceipt_tenantId_batchId_idx" ON "PrintReceipt"("tenantId", "batchId");

CREATE UNIQUE INDEX "Shipment_batchId_key" ON "Shipment"("batchId");
CREATE INDEX "Shipment_tenantId_shippedAt_idx" ON "Shipment"("tenantId", "shippedAt");

ALTER TABLE "OemUser" ADD CONSTRAINT "OemUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OemUser" ADD CONSTRAINT "OemUser_oemId_fkey" FOREIGN KEY ("oemId") REFERENCES "Oem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OemUser" ADD CONSTRAINT "OemUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManifestDelivery" ADD CONSTRAINT "ManifestDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManifestDelivery" ADD CONSTRAINT "ManifestDelivery_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManifestDelivery" ADD CONSTRAINT "ManifestDelivery_oemId_fkey" FOREIGN KEY ("oemId") REFERENCES "Oem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManifestDownload" ADD CONSTRAINT "ManifestDownload_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ManifestDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManifestDownload" ADD CONSTRAINT "ManifestDownload_oemUserId_fkey" FOREIGN KEY ("oemUserId") REFERENCES "OemUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrintReceipt" ADD CONSTRAINT "PrintReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintReceipt" ADD CONSTRAINT "PrintReceipt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintReceipt" ADD CONSTRAINT "PrintReceipt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ManifestDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintReceipt" ADD CONSTRAINT "PrintReceipt_oemUserId_fkey" FOREIGN KEY ("oemUserId") REFERENCES "OemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_oemUserId_fkey" FOREIGN KEY ("oemUserId") REFERENCES "OemUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
