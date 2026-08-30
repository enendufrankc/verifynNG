ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'restricted';

ALTER TABLE "Tenant"
  ADD COLUMN "trademarkNumber" TEXT,
  ADD COLUMN "country" CHAR(2),
  ADD COLUMN "statusReason" TEXT,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "offboardedAt" TIMESTAMP(3),
  ADD COLUMN "scheduledDeletionAt" TIMESTAMP(3),
  ADD COLUMN "branding" JSONB,
  ADD COLUMN "supportEmail" TEXT,
  ADD COLUMN "websiteUrl" TEXT;

CREATE TYPE "VerificationDocumentKind" AS ENUM ('cac_certificate', 'trademark_certificate', 'director_id', 'other');
CREATE TYPE "VerificationDocumentStatus" AS ENUM ('awaiting_upload', 'uploaded', 'accepted', 'rejected');
CREATE TYPE "PolicyKind" AS ENUM ('aup', 'tos', 'privacy');

CREATE TABLE "VerificationDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "VerificationDocumentKind" NOT NULL,
  "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'awaiting_upload',
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "reviewedBy" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TenantReviewNote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "visibleToTenant" BOOLEAN NOT NULL DEFAULT true,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantReviewNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PolicyDocument" (
  "id" TEXT NOT NULL,
  "kind" "PolicyKind" NOT NULL,
  "version" TEXT NOT NULL,
  "markdown" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PolicyAcceptance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "PolicyKind" NOT NULL,
  "version" TEXT NOT NULL,
  "ipPrefix" TEXT,
  "userAgent" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TenantExport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "objectKey" TEXT,
  "sizeBytes" INTEGER,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TenantExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationDocument_objectKey_key" ON "VerificationDocument"("objectKey");
CREATE INDEX "VerificationDocument_tenantId_kind_idx" ON "VerificationDocument"("tenantId", "kind");
CREATE INDEX "TenantReviewNote_tenantId_createdAt_idx" ON "TenantReviewNote"("tenantId", "createdAt");
CREATE UNIQUE INDEX "PolicyDocument_kind_version_key" ON "PolicyDocument"("kind", "version");
CREATE UNIQUE INDEX "PolicyAcceptance_tenantId_kind_version_key" ON "PolicyAcceptance"("tenantId", "kind", "version");
CREATE INDEX "PolicyAcceptance_tenantId_idx" ON "PolicyAcceptance"("tenantId");
CREATE INDEX "TenantExport_tenantId_idx" ON "TenantExport"("tenantId");

ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantReviewNote" ADD CONSTRAINT "TenantReviewNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantExport" ADD CONSTRAINT "TenantExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
