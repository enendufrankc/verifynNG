-- E18 — change request to E03 (CROSS-EPIC-REQUESTS.md "To E03 Tenant Lifecycle"):
-- tenant-level opt-out of the impersonation-started notice.
ALTER TABLE "Tenant" ADD COLUMN "notifyOnImpersonation" BOOLEAN NOT NULL DEFAULT true;
