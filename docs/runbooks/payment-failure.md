# Runbook: Payment / Billing Failure

**Status: mostly aspirational.** E15 (Billing & Entitlements) is `todo` as of
this writing — there is no `Subscription`, `Invoice`, `Payment` model, no
Paystack integration, and no dunning flow in this repo yet. This runbook
documents the procedure E15 is expected to support once it ships, so support
isn't starting from zero on day one of E15 landing; everything below that
references a feature is marked accordingly. Until then, a payment-failure
ticket has no platform-side remediation beyond the manual steps in §3.

---

## 1. Trigger & Detection (once E15 ships)

- `subscription.restricted` notification fires (E15 → E14 template, per
  `docs/epics/E14-notifications.md` "Templates requested").
- A ticket arrives describing a failed charge or a tenant reporting console
  access has gone read-only.

## 2. First 5 minutes

1. Confirm the tenant's subscription/invoice status via
   `GET /v1/platform/tenants/:tenantId` (E18's own directory — already ships
   a `planCode` column, currently always `null` until E15 provides
   `GET /v1/platform/subscriptions`).
2. Check the Paystack dashboard (external, not part of this compose stack)
   for the actual charge attempt and failure reason.
3. Check Mailpit for the dunning email sequence to confirm the tenant was
   actually notified before console access was restricted.

## 3. Remediation

- **Once E15 ships:** use its "mark paid" platform route (per
  `docs/epics/E15-billing-entitlements.md`) to manually reconcile a payment
  that succeeded on Paystack's side but didn't land via webhook — this is an
  audited support action, not a tenant action (see E18's Notes: "support
  fixes those via their own platform routes ... which are audited as support
  actions rather than tenant actions").
- **Today (no E15):** there is no platform-side lever. Escalate to
  engineering; do not attempt to hand-edit billing state that doesn't exist.

## 4. Verification

- Tenant status returns to `active` (or the E15-specific `restricted` clears
  — see `docs/epics/CROSS-EPIC-REQUESTS.md` "To E03 Tenant Lifecycle" for the
  planned `restricted` status and its guard semantics).
- `subscription.reactivated` notification sent.

## Post-incident review template

- **Incident Title:**
- **Tenant:**
- **Date / Duration of restriction:**
- **Root cause (webhook drop, card decline, dunning bug, ...):**
- **Manual reconciliation performed:**
