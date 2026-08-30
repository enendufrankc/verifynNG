-- E04 Catalog & Minting — additive migration (rewritten by coordinator 2026-08-30).
-- Existing rows (E21 realistic seed, earlier dev data) are preserved and backfilled.

CREATE TYPE "BatchStatus" AS ENUM ('minting', 'minted', 'delivered', 'printed', 'shipped', 'closed', 'failed');
CREATE TYPE "OemStatus" AS ENUM ('active', 'suspended');

-- Batch: new columns with defaults/backfill, status String -> enum in place
ALTER TABLE "Batch"
  ADD COLUMN "exportsReadyAt" TIMESTAMP(3),
  ADD COLUMN "failedReason" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "kid" TEXT NOT NULL DEFAULT 'k1',
  ADD COLUMN "lastChunk" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "manifestObjectKey" TEXT,
  ADD COLUMN "manifestSha256" TEXT,
  ADD COLUMN "mintedAt" TIMESTAMP(3),
  ADD COLUMN "mintedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "requestedBy" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "watermark" TEXT NOT NULL DEFAULT '';
UPDATE "Batch" SET "idempotencyKey" = 'legacy-' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "Batch" ALTER COLUMN "idempotencyKey" SET NOT NULL;
ALTER TABLE "Batch" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Batch" ALTER COLUMN "status" TYPE "BatchStatus"
  USING (CASE WHEN "status" IN ('minting','minted','delivered','printed','shipped','closed','failed')
              THEN "status"::"BatchStatus" ELSE 'minted'::"BatchStatus" END);
ALTER TABLE "Batch" ALTER COLUMN "status" SET DEFAULT 'minting';

-- Oem
ALTER TABLE "Oem"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "status" "OemStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Product
ALTER TABLE "Product"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "category" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageObjectKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Unit: productId backfilled from the batch, serial backfilled per batch
ALTER TABLE "Unit" ADD COLUMN "productId" TEXT, ADD COLUMN "serial" INTEGER;
UPDATE "Unit" u SET "productId" = b."productId" FROM "Batch" b WHERE u."batchId" = b."id" AND u."productId" IS NULL;
UPDATE "Unit" u SET "serial" = s.rn FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "batchId" ORDER BY "createdAt", "id") AS rn FROM "Unit"
) s WHERE u."id" = s."id" AND u."serial" IS NULL;
ALTER TABLE "Unit" ALTER COLUMN "productId" SET NOT NULL, ALTER COLUMN "serial" SET NOT NULL;

-- BatchArtefact
CREATE TABLE "BatchArtefact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchArtefact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BatchArtefact_batchId_kind_key" ON "BatchArtefact"("batchId", "kind");
CREATE INDEX "Batch_tenantId_status_createdAt_idx" ON "Batch"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "Batch_tenantId_idempotencyKey_key" ON "Batch"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "Oem_tenantId_name_key" ON "Oem"("tenantId", "name");
CREATE UNIQUE INDEX "Product_tenantId_gtin_key" ON "Product"("tenantId", "gtin");
CREATE INDEX "Unit_tenantId_batchId_idx" ON "Unit"("tenantId", "batchId");
CREATE INDEX "Unit_productId_idx" ON "Unit"("productId");
CREATE UNIQUE INDEX "Unit_batchId_serial_key" ON "Unit"("batchId", "serial");

ALTER TABLE "BatchArtefact" ADD CONSTRAINT "BatchArtefact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
