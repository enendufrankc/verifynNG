-- CreateEnum
CREATE TYPE "PurchaseChannel" AS ENUM ('open_market', 'street_vendor', 'online_marketplace', 'social_media', 'pharmacy', 'supermarket', 'brand_store', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('new', 'triaged', 'investigating', 'closed');

-- CreateEnum
CREATE TYPE "ReportOutcome" AS ENUM ('confirmed_counterfeit', 'legit', 'insufficient');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('pending', 'uploaded', 'processing', 'ready', 'rejected');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "scanEventId" TEXT,
    "unitId" TEXT,
    "batchId" TEXT,
    "productId" TEXT,
    "verdictAtReport" TEXT NOT NULL,
    "sellerName" TEXT,
    "sellerLocation" TEXT,
    "purchaseChannel" "PurchaseChannel" NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "description" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactConsentId" TEXT,
    "contactPurgedAt" TIMESTAMP(3),
    "status" "ReportStatus" NOT NULL DEFAULT 'new',
    "outcome" "ReportOutcome",
    "assignedToId" TEXT,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "locale" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT,
    "incomingKey" TEXT NOT NULL,
    "objectKey" TEXT,
    "contentType" TEXT NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "storedBytes" INTEGER,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" "PhotoStatus" NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ReportPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportStatusChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus" NOT NULL,
    "outcome" "ReportOutcome",
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "consumerNotified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_reference_key" ON "Report"("reference");

-- CreateIndex
CREATE INDEX "Report_tenantId_status_createdAt_idx" ON "Report"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_tenantId_batchId_idx" ON "Report"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "Report_unitId_idx" ON "Report"("unitId");

-- CreateIndex
CREATE INDEX "Report_tenantId_assignedToId_idx" ON "Report"("tenantId", "assignedToId");

-- CreateIndex
CREATE INDEX "ReportPhoto_reportId_idx" ON "ReportPhoto"("reportId");

-- CreateIndex
CREATE INDEX "ReportPhoto_status_createdAt_idx" ON "ReportPhoto"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportNote_reportId_createdAt_idx" ON "ReportNote"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportStatusChange_reportId_createdAt_idx" ON "ReportStatusChange"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReportPhoto" ADD CONSTRAINT "ReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportNote" ADD CONSTRAINT "ReportNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusChange" ADD CONSTRAINT "ReportStatusChange_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

