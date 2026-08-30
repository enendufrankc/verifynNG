-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('queued', 'sending', 'sent', 'failed', 'suppressed', 'bounced');

-- CreateEnum
CREATE TYPE "DeliveryEventType" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'retried');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('bounce', 'complaint', 'unsubscribe', 'manual');

-- CreateEnum
CREATE TYPE "SenderVerification" AS ENUM ('pending', 'verified', 'failed');

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "templateId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "data" JSONB NOT NULL,
    "renderedSubject" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryEvent" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "type" "DeliveryEventType" NOT NULL,
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRoutingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "channels" "NotificationChannel"[],
    "roles" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSuppression" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSenderIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "domain" TEXT,
    "verificationStatus" "SenderVerification" NOT NULL DEFAULT 'pending',
    "dnsRecords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSenderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_idempotencyKey_key" ON "NotificationOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_tenantId_createdAt_idx" ON "NotificationOutbox"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_scheduledAt_idx" ON "NotificationOutbox"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_providerMessageId_idx" ON "NotificationOutbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryEvent_outboxId_idx" ON "NotificationDeliveryEvent"("outboxId");

-- CreateIndex
CREATE INDEX "NotificationRoutingRule_tenantId_idx" ON "NotificationRoutingRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRoutingRule_tenantId_eventName_templateId_key" ON "NotificationRoutingRule"("tenantId", "eventName", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSuppression_channel_recipient_key" ON "NotificationSuppression"("channel", "recipient");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSenderIdentity_tenantId_channel_key" ON "TenantSenderIdentity"("tenantId", "channel");

-- AddForeignKey
ALTER TABLE "NotificationDeliveryEvent" ADD CONSTRAINT "NotificationDeliveryEvent_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
