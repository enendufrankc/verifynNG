# Runbooks

Index of the platform's incident runbooks. Each one follows the same shape:
trigger, first 5 minutes, diagnosis, remediation, verification, post-incident.
Written to be followed literally at 2 a.m. by whoever is on call, not just by
the person who wrote it.

| Runbook                                            | Use when                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`onboarding-failure.md`](onboarding-failure.md)   | A tenant can't complete signup/verification, or their first mint/verify fails. |
| [`auth-lockout.md`](auth-lockout.md)               | A user is locked out (failed logins, lost MFA device) or SSO login is broken.  |
| [`payment-failure.md`](payment-failure.md)         | A subscription payment failed, dunning is stuck, or billing looks wrong.       |
| [`cross-tenant-alert.md`](cross-tenant-alert.md)   | E21's isolation matrix or E13 flags a possible cross-tenant data leak.         |
| [`restore-from-backup.md`](restore-from-backup.md) | Data loss/corruption requires restoring Postgres from a backup.                |
| [`verify-api-down.md`](verify-api-down.md)         | The public verify path (`/v1/verify/*`) is failing or degraded (E17).          |
| [`breach-notification.md`](breach-notification.md) | A confirmed data breach requires regulatory/tenant notification (E19).         |

## Severity ladder

| Severity | Definition                                                      | Example                                                                               | Page?                                                          |
| -------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **SEV1** | Public verify path down, or a confirmed cross-tenant data leak. | `/v1/verify/:code` returning 5xx platform-wide; E21 isolation test failing on `main`. | Yes, immediately.                                              |
| **SEV2** | A tenant-impacting feature is broken but verify still works.    | Minting fails for all tenants; billing charges failing platform-wide.                 | Yes, during business hours; page if outside hours and growing. |
| **SEV3** | A single tenant or a small number of users affected.            | One tenant's MFA reset stuck; one payment retry failing.                              | No — ticket/issue, next business day.                          |
| **SEV4** | Cosmetic or workaround-available.                               | A docs page 404s; a canned response has a typo.                                       | No.                                                            |

## Who to page

Local/dev environment: there is no real on-call rotation — these runbooks are
rehearsed by whoever is running the compose stack. In a real deployment, wire
this table to your paging tool (PagerDuty, Opsgenie, …) with actual rotations;
until then, treat "page" as "message the platform-eng channel."

## Restore drill cadence

`restore-from-backup.md` is the one runbook that must never stay theoretical.
E21 schedules it nightly against this worktree's compose stack; each run
appends a row to that runbook's "Last drill" table with the actual duration.
