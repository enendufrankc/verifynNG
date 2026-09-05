-- E18 — Support Tooling: impersonation, tickets, canned responses.
-- Written by hand (not via `prisma migrate dev`) because this repo's
-- `audit_chain_head` table is unmanaged raw SQL with no Prisma model, and
-- migrate dev's diff engine proposes dropping it every time; `migrate
-- deploy` (which this file is applied through) just runs pending SQL and
-- never diffs, so that's sidestepped entirely by hand-writing the SQL for
-- exactly the additive changes below.

-- CreateEnum
CREATE TYPE "ImpersonationMode" AS ENUM ('read', 'write');
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'pending_customer', 'resolved', 'closed');
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE "TicketChannel" AS ENUM ('console', 'public', 'email');
CREATE TYPE "TicketNoteKind" AS ENUM ('internal', 'reply', 'system');

-- AlterTable: E18 change request to E13 — see CROSS-EPIC-REQUESTS.md.
-- Deliberately NOT part of AuditService's hash-chain input (see audit.service.ts):
-- adding them there would change the canonicalized hash input for every row
-- going forward without a chain reset, breaking verifyChain() for anything
-- written before this migration.
ALTER TABLE "AuditLog" ADD COLUMN "impersonatedBy" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "impersonationSessionId" TEXT;

-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "supportUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "ImpersonationMode" NOT NULL,
    "reason" TEXT,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "tenantId" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "requesterUserId" TEXT,
    "channel" "TicketChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "assigneeId" TEXT,
    "pageUrl" TEXT,
    "relatedCode" TEXT,
    "emailThreadId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "TicketNoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImpersonationSession_sessionId_key" ON "ImpersonationSession"("sessionId");
CREATE INDEX "ImpersonationSession_supportUserId_endedAt_idx" ON "ImpersonationSession"("supportUserId", "endedAt");
CREATE INDEX "ImpersonationSession_tenantId_startedAt_idx" ON "ImpersonationSession"("tenantId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");
CREATE INDEX "Ticket_status_priority_lastActivityAt_idx" ON "Ticket"("status", "priority", "lastActivityAt");
CREATE INDEX "Ticket_tenantId_createdAt_idx" ON "Ticket"("tenantId", "createdAt");
CREATE INDEX "Ticket_requesterEmail_idx" ON "Ticket"("requesterEmail");

-- CreateIndex
CREATE INDEX "TicketNote_ticketId_createdAt_idx" ON "TicketNote"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CannedResponse_slug_key" ON "CannedResponse"("slug");

-- AddForeignKey
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
