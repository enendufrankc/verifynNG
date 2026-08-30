-- E12 — Analytics & Usage Metering: UsageEvent (immutable), UsageSummary,
-- ScanRollupDaily, PageViewRollupDaily, RollupCheckpoint.
-- Hand-written (not `prisma migrate dev`) because this database also carries
-- E13's raw-SQL-only `audit_chain_head` table, which has no Prisma model and
-- would otherwise show up as a spurious DROP in an auto-generated diff.

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('code_minted', 'scan_tier1', 'scan_tier2', 'api_call', 'notification_sent');

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ref" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageSummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "finalisedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRollupDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "productId" TEXT,
    "batchId" TEXT,
    "tier" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "distinctIpCount" INTEGER NOT NULL,
    "topCountries" JSONB NOT NULL,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "flaggedUnits" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanRollupDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageViewRollupDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "route" TEXT NOT NULL,
    "referrerType" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "PageViewRollupDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollupCheckpoint" (
    "id" TEXT NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "lastEventId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RollupCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_tenantId_kind_idempotencyKey_key" ON "UsageEvent"("tenantId", "kind", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_occurredAt_idx" ON "UsageEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_kind_occurredAt_idx" ON "UsageEvent"("tenantId", "kind", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageSummary_tenantId_month_kind_key" ON "UsageSummary"("tenantId", "month", "kind");

-- CreateIndex
CREATE INDEX "UsageSummary_tenantId_month_idx" ON "UsageSummary"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ScanRollupDaily_unique_key" ON "ScanRollupDaily"("tenantId", "date", "productId", "batchId", "tier", "verdict");

-- CreateIndex
CREATE INDEX "ScanRollupDaily_tenantId_date_idx" ON "ScanRollupDaily"("tenantId", "date");

-- CreateIndex
CREATE INDEX "ScanRollupDaily_tenantId_batchId_date_idx" ON "ScanRollupDaily"("tenantId", "batchId", "date");

-- CreateIndex
CREATE INDEX "ScanRollupDaily_tenantId_productId_date_idx" ON "ScanRollupDaily"("tenantId", "productId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PageViewRollupDaily_unique_key" ON "PageViewRollupDaily"("tenantId", "date", "route", "referrerType", "locale");

-- CreateIndex
CREATE INDEX "PageViewRollupDaily_tenantId_date_idx" ON "PageViewRollupDaily"("tenantId", "date");

-- UsageEvent immutability: no UPDATE ever (DELETE remains allowed, for E19's retention purge).
CREATE OR REPLACE FUNCTION usage_event_immutable_fn()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UsageEvent is immutable';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usage_event_immutable
  BEFORE UPDATE ON "UsageEvent"
  FOR EACH ROW
  EXECUTE FUNCTION usage_event_immutable_fn();

-- Revoke UPDATE from the application role, same pattern as E13's AuditLog trigger.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verifyng_app') THEN
    REVOKE UPDATE ON "UsageEvent" FROM "verifyng_app";
  END IF;
END;
$$;
