-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "unitId" TEXT,
    "batchId" TEXT,
    "score" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'open',
    "dedupeKey" TEXT NOT NULL,
    "assignedToId" TEXT,
    "note" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyRuleConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnomalyRuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitStateTransition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "anomalyId" TEXT,
    "recallJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Anomaly_dedupeKey_key" ON "Anomaly"("dedupeKey");

-- CreateIndex
CREATE INDEX "Anomaly_tenantId_status_score_idx" ON "Anomaly"("tenantId", "status", "score");

-- CreateIndex
CREATE INDEX "Anomaly_tenantId_rule_createdAt_idx" ON "Anomaly"("tenantId", "rule", "createdAt");

-- CreateIndex
CREATE INDEX "Anomaly_unitId_idx" ON "Anomaly"("unitId");

-- CreateIndex
CREATE INDEX "Anomaly_batchId_idx" ON "Anomaly"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "AnomalyRuleConfig_tenantId_rule_key" ON "AnomalyRuleConfig"("tenantId", "rule");

-- CreateIndex
CREATE INDEX "UnitStateTransition_unitId_createdAt_idx" ON "UnitStateTransition"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "UnitStateTransition_tenantId_createdAt_idx" ON "UnitStateTransition"("tenantId", "createdAt");
