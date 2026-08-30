-- E19 Compliance & Data Governance
-- Hand-curated: `prisma migrate diff` also reported unrelated pre-existing
-- drift owned by other epics (dropped ScanEvent FKs, dropped column
-- defaults on Batch/Oem/Product/QuotaOverride/VerificationDocument, and a
-- drop of the raw `audit_chain_head` table that has no Prisma model by
-- design for E13's atomic chain-head locking). None of that is included
-- here — only E19's additive changes.

-- CreateEnum
CREATE TYPE "ConsentSubjectType" AS ENUM ('consumer', 'user');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('contact_followup', 'marketing', 'analytics_optional', 'terms_acceptance');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('report_form', 'signup', 'admin_preferences', 'legal_reaccept', 'import');

-- CreateEnum
CREATE TYPE "LegalHoldScope" AS ENUM ('tenant', 'unit', 'report', 'consumer');

-- CreateEnum
CREATE TYPE "DsarSubjectType" AS ENUM ('consumer', 'tenant');

-- CreateEnum
CREATE TYPE "DsarAction" AS ENUM ('export', 'erase');

-- CreateEnum
CREATE TYPE "DsarStatus" AS ENUM ('pending_verification', 'verified', 'processing', 'completed', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'assessing', 'contained', 'notified', 'closed');

-- AlterEnum
ALTER TYPE "PolicyKind" ADD VALUE 'cookie';
ALTER TYPE "PolicyKind" ADD VALUE 'subprocessors';

-- AlterTable
ALTER TABLE "PolicyDocument" ADD COLUMN     "changeSummary" TEXT,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "requiresReacceptance" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
DROP INDEX "PolicyDocument_kind_version_key";

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_kind_locale_version_key" ON "PolicyDocument"("kind", "locale", "version");

-- CreateIndex
CREATE INDEX "PolicyDocument_kind_locale_effectiveFrom_idx" ON "PolicyDocument"("kind", "locale", "effectiveFrom");

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "documentKind" "PolicyKind",
    "documentVersion" TEXT,
    "evidence" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "matched" INTEGER NOT NULL,
    "affected" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "scope" "LegalHoldScope" NOT NULL,
    "ref" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsarRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "subjectType" "DsarSubjectType" NOT NULL,
    "action" "DsarAction" NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "lookupRef" TEXT,
    "status" "DsarStatus" NOT NULL DEFAULT 'pending_verification',
    "verifyTokenHash" TEXT,
    "verifyExpiresAt" TIMESTAMP(3),
    "exportObjectKey" TEXT,
    "exportExpiresAt" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DsarRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "dataCategories" TEXT[],
    "affectedTenantIds" TEXT[],
    "estimatedSubjects" INTEGER,
    "ndpcNotifyRequired" BOOLEAN,
    "ndpcNotifyDeadline" TIMESTAMP(3),
    "ndpcNotifiedAt" TIMESTAMP(3),
    "icoNotifyRequired" BOOLEAN,
    "timeline" JSONB NOT NULL,
    "postmortemUrl" TEXT,
    "openedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_subjectType_subjectRef_purpose_at_idx" ON "ConsentRecord"("tenantId", "subjectType", "subjectRef", "purpose", "at");

-- CreateIndex
CREATE INDEX "ConsentRecord_subjectType_subjectRef_purpose_at_idx" ON "ConsentRecord"("subjectType", "subjectRef", "purpose", "at");

-- CreateIndex
CREATE INDEX "RetentionRun_policy_startedAt_idx" ON "RetentionRun"("policy", "startedAt");

-- CreateIndex
CREATE INDEX "LegalHold_scope_ref_releasedAt_idx" ON "LegalHold"("scope", "ref", "releasedAt");

-- CreateIndex
CREATE INDEX "DsarRequest_subjectType_subjectRef_requestedAt_idx" ON "DsarRequest"("subjectType", "subjectRef", "requestedAt");

-- CreateIndex
CREATE INDEX "DsarRequest_status_requestedAt_idx" ON "DsarRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "Incident_status_detectedAt_idx" ON "Incident"("status", "detectedAt");
