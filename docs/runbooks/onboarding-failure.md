# Runbook: Tenant Onboarding Failure

## 1. Trigger & Detection

- A ticket (any channel) says a business signed up but is stuck — can't
  submit verification documents, stuck in "pending"/"in review" for an
  unreasonable time, or their first mint/verify fails right after approval.
- Support's queue at `/support/tenant-review` (E03) shows a tenant that's
  been `in_review` far longer than normal.

## 2. First 5 minutes

1. Look the tenant up in the directory (`/support` → search by name/slug) to
   confirm its current `status`, and open the detail drawer for recent audit
   activity.
2. If they're stuck at `pending`/`in_review`, open `/support/tenant-review`
   (E03's queue) and check whether their verification documents actually
   uploaded (`GET /support/tenants/:tenantId/verification`) — a common cause
   is a MinIO upload failure that left the tenant with zero documents and no
   visible error on their end.
3. If they were just approved and their first mint/verify fails, check
   `docker compose logs api` for the specific request (see
   `cross-tenant-alert.md` §2 for the log-grep pattern) — first-mint failures
   are usually a missing `Product` (catalog not set up yet) or a quota limit
   (`mints_per_day`) rather than an onboarding bug per se.

## 3. Remediation

- **Stuck in review, documents present:** this is a manual decision, not a
  bug — approve/reject via `/support/tenant-review` (`POST
/support/tenants/:tenantId/approve` or `/reject`) once someone has actually
  reviewed the documents. Don't approve to clear a queue without reviewing.
- **Documents missing/upload failed:** ask the tenant to re-upload; check
  MinIO is healthy (`docker compose ps minio`) if it happens more than once.
- **First mint/verify fails after approval:** walk them through creating at
  least one `Product` before minting (catalog is empty for a brand-new
  tenant by design); if it's a quota error, that's expected behavior working
  correctly, not a failure — explain the limit, don't raise it without a
  reason on file.

## 4. Verification

- Tenant status is `active` (or a deliberate `rejected` with a reason on
  file) and they can complete a mint → verify round trip.

## Post-incident review template

- **Tenant:**
- **Where they got stuck:**
- **Root cause:**
- **Fix / manual action:**
