# Runbook: Auth Lockout (Password / MFA / SSO)

## 1. Trigger & Detection

- A user reports they can't log in (locked out after failed attempts, or lost
  their MFA device/recovery codes).
- A ticket arrives via `/support` or console help tagged with subject
  containing "locked out" / "can't log in" / "lost my authenticator".
- SSO users specifically: login redirects to the identity provider and back
  with an error (E20 — SSO & MFA Policy, `todo` as of this writing).

---

## 2. First 5 Minutes (Triage)

1. Identify the user and confirm identity out-of-band (support ticket email
   must match the account email; for anything beyond a password reset, get a
   second confirmation signal — see §5).
2. Check `User.failedLoginCount` / `lockedUntil` and `User.mfaEnabled` for the
   account:
   ```bash
   docker compose -f docker/compose.yml exec postgres \
     psql -U postgres -d verifynng -c \
     "select id, email, \"failedLoginCount\", \"lockedUntil\", \"mfaEnabled\" from \"User\" where email = 'USER_EMAIL';"
   ```
3. Check the audit log for recent login attempts on this account
   (`/v1/support/audit?actorId=<userId>&action=login`) via the support console
   audit filter, or `SupportAuditController` directly.

---

## 3. Remediation by cause

### A. Locked out from repeated failed password attempts (no MFA lost)

The user's own password-reset flow (`/forgot-password` → `password.reset`
email) is the correct fix — it does not require support to touch anything.
Only intervene if the reset email isn't arriving (check Mailpit
`http://localhost:8025`, then E14's outbox/suppression state for that
address).

### B. Lost MFA device / recovery codes

`POST /auth/mfa/disable` requires the user's own password **and** current MFA
code, which is exactly what a locked-out user can't produce — there is
currently no admin-facing MFA reset endpoint or CLI in E02's auth module
(`apps/api/src/modules/auth/**`; confirmed absent when this runbook was
written for E18). Until E02 adds one, the only remediation is a direct,
audited database operation:

```bash
docker compose -f docker/compose.yml exec postgres \
  psql -U postgres -d verifynng -c \
  "update \"User\" set \"mfaEnabled\" = false, \"mfaSecret\" = null, \"recoveryCodes\" = '{}' where email = 'USER_EMAIL';"
```

Then record a manual audit entry (there is no `@Audited` route for this path
yet, so it will not appear in the audit log automatically) and tell the user
to re-enable MFA immediately after logging back in.

**Gap to raise with E02:** an admin-facing, audited "reset MFA" endpoint or
CLI command so this stops requiring a raw SQL statement. Track as a follow-up
issue rather than a silent workaround.

### C. SSO break-glass

E20 (SSO & MFA Policy) is `todo` as of this writing — there is no SSO login
path, and therefore no break-glass procedure to document yet. When E20 ships,
this section should link its documented break-glass flow rather than
duplicate it.

---

## 4. Verification

- User can log in and (for MFA resets) successfully re-enrolls MFA.
- `failedLoginCount` back to 0, `lockedUntil` cleared.

---

## 5. Notes

- Never reset MFA or disable lockout on a support ticket alone — email
  spoofing is trivial. Require at least one additional signal (a detail only
  the real account owner would know, or a callback on file) before touching
  auth state, per `docs/support-impersonation-policy.md`'s identity-check
  principle even though this isn't an impersonation action.
- Every direct database intervention here should be followed by a note on the
  originating ticket recording what was changed and why, since it isn't
  captured by the audit log automatically.

## Post-incident review template

- **Incident Title:**
- **Date / Duration:**
- **Account(s) affected:**
- **Root cause:**
- **Remediation applied:**
- **Follow-up (e.g. "raise admin MFA reset with E02"):**
