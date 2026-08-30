-- DropIndex
DROP INDEX IF EXISTS "ScanEvent_tenantId_idx";
DROP INDEX IF EXISTS "ScanEvent_unitId_idx";

-- CreateEnum
CREATE TYPE "ScanTier" AS ENUM ('tier1', 'tier2');

-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('qr', 'manual', 'sms', 'api');

-- AlterTable: drop old `ip` column, add E06 columns
ALTER TABLE "ScanEvent" DROP COLUMN IF EXISTS "ip";
ALTER TABLE "ScanEvent" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ScanEvent" ADD COLUMN "productId" TEXT;
ALTER TABLE "ScanEvent" ADD COLUMN "source" "ScanSource" NOT NULL DEFAULT 'qr';
ALTER TABLE "ScanEvent" ADD COLUMN "codeRedacted" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ScanEvent" ADD COLUMN "ipHash" TEXT;
ALTER TABLE "ScanEvent" ADD COLUMN "ipPrefix" TEXT;
ALTER TABLE "ScanEvent" ALTER COLUMN "geoCountry" SET DATA TYPE CHAR(2);
ALTER TABLE "ScanEvent" ADD COLUMN "geoRegion" TEXT;
ALTER TABLE "ScanEvent" ADD COLUMN "deviceClass" TEXT;
ALTER TABLE "ScanEvent" ADD COLUMN "latencyMs" INTEGER;

-- AlterTable: change tier from Int to ScanTier enum
ALTER TABLE "ScanEvent" ADD COLUMN "tier_new" "ScanTier";
UPDATE "ScanEvent" SET "tier_new" = CASE "tier" WHEN 1 THEN 'tier1'::"ScanTier" WHEN 2 THEN 'tier2'::"ScanTier" ELSE 'tier1'::"ScanTier" END;
ALTER TABLE "ScanEvent" DROP COLUMN "tier";
ALTER TABLE "ScanEvent" RENAME COLUMN "tier_new" TO "tier";
ALTER TABLE "ScanEvent" ALTER COLUMN "tier" SET DEFAULT 'tier1';

-- AlterTable: add verifyRateLimitPerMin to Tenant
ALTER TABLE "Tenant" ADD COLUMN "verifyRateLimitPerMin" INTEGER NOT NULL DEFAULT 600;

-- CreateTable: IpBlock
CREATE TABLE "IpBlock" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "tenantSlug" TEXT,
    "reason" TEXT NOT NULL,
    "invalidCount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanEvent_tenantId_createdAt_idx" ON "ScanEvent"("tenantId", "createdAt");
CREATE INDEX "ScanEvent_unitId_tier_createdAt_idx" ON "ScanEvent"("unitId", "tier", "createdAt");
CREATE INDEX "ScanEvent_tenantId_verdict_createdAt_idx" ON "ScanEvent"("tenantId", "verdict", "createdAt");
CREATE INDEX "ScanEvent_ipHash_createdAt_idx" ON "ScanEvent"("ipHash", "createdAt");
CREATE INDEX "IpBlock_ipHash_expiresAt_idx" ON "IpBlock"("ipHash", "expiresAt");

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
