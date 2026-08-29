-- E13 — AuditLog extensions: add seq, actorType, actorIp, requestId, targetType, targetId
-- Add new enum
CREATE TYPE "AuditActorType" AS ENUM ('user', 'system', 'oem', 'support', 'apikey');

-- Add columns to AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "seq" BIGSERIAL;
ALTER TABLE "AuditLog" ADD COLUMN "actorType" "AuditActorType" NOT NULL DEFAULT 'user';
ALTER TABLE "AuditLog" ADD COLUMN "actorIp" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "targetType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AuditLog" ADD COLUMN "targetId" TEXT NOT NULL DEFAULT '';

-- Make hash unique and seq unique
CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_hash_key" ON "AuditLog"("hash");
CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_seq_key" ON "AuditLog"("seq");

-- Add E13 indexes
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog"("tenantId", "action", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- Drop old default hash index if it exists (Prisma may have created one)
-- The unique index above replaces it

-- Create audit_chain_head table for atomic chain-head locking
CREATE TABLE IF NOT EXISTS "audit_chain_head" (
  "id" INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "prevHash" TEXT NOT NULL DEFAULT 'GENESIS',
  "lastSeq" BIGINT NOT NULL DEFAULT 0
);

-- Seed the chain head row
INSERT INTO "audit_chain_head" ("id", "prevHash", "lastSeq")
VALUES (1, 'GENESIS', 0)
ON CONFLICT ("id") DO NOTHING;

-- Create AuditChainCheckpoint table
CREATE TABLE "AuditChainCheckpoint" (
  "id" TEXT NOT NULL,
  "fromSeq" BIGINT NOT NULL,
  "toSeq" BIGINT NOT NULL,
  "headHash" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL,
  "rowsChecked" INTEGER NOT NULL,
  "firstBadSeq" BIGINT,
  "triggeredById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditChainCheckpoint_pkey" PRIMARY KEY ("id")
);

-- Create QuotaOverride table
CREATE TABLE "QuotaOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "limit" INTEGER NOT NULL,
  "window" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuotaOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotaOverride_tenantId_kind_key" ON "QuotaOverride"("tenantId", "kind");

-- Immutability trigger: prevent UPDATE and DELETE on AuditLog
CREATE OR REPLACE FUNCTION audit_log_immutable_fn()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_immutable_fn();

-- Revoke UPDATE and DELETE from the application role
-- Note: In compose, the migration runs as the superuser (postgres).
-- The app role 'verifyng_app' may or may not exist yet; this is safe to run conditionally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verifyng_app') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM "verifyng_app";
  END IF;
END;
$$;
