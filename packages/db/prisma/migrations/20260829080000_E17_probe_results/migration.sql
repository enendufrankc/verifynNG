-- CreateTable
CREATE TABLE "ProbeResult" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "verdict" TEXT,
    "region" TEXT NOT NULL DEFAULT 'local',
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProbeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusDaily" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checks" INTEGER NOT NULL,
    "failures" INTEGER NOT NULL,
    "p95Ms" INTEGER NOT NULL,

    CONSTRAINT "StatusDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProbeResult_target_at_idx" ON "ProbeResult"("target", "at");

-- CreateIndex
CREATE UNIQUE INDEX "StatusDaily_target_date_key" ON "StatusDaily"("target", "date");
