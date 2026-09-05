-- CreateEnum
CREATE TYPE "SsoProvider" AS ENUM ('google', 'microsoft', 'fake');

-- AlterTable: E02 Session — authentication methods reference
ALTER TABLE "Session" ADD COLUMN "amr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: E02 Membership — how the membership was created (invite | jit)
ALTER TABLE "Membership" ADD COLUMN "createdVia" TEXT;

-- CreateTable
CREATE TABLE "TenantSsoConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "issuer" TEXT,
    "allowedDomains" TEXT[],
    "jitProvisioning" BOOLEAN NOT NULL DEFAULT false,
    "jitDefaultRole" TEXT NOT NULL DEFAULT 'viewer',
    "enforceSso" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSsoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMfaPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requiredRoles" TEXT[],
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "enforcedFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMfaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSsoConfig_tenantId_key" ON "TenantSsoConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoIdentity_tenantId_provider_subject_key" ON "SsoIdentity"("tenantId", "provider", "subject");

-- CreateIndex
CREATE INDEX "SsoIdentity_tenantId_userId_idx" ON "SsoIdentity"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMfaPolicy_tenantId_key" ON "TenantMfaPolicy"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantSsoConfig" ADD CONSTRAINT "TenantSsoConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMfaPolicy" ADD CONSTRAINT "TenantMfaPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
