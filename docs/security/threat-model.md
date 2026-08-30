# Threat model

STRIDE analysis over the platform's five highest-value attack surfaces. Each
row names the mitigation and which epic implements it — this list is the
one place that ties "what could go wrong" to "what actually stops it."

Background: [`docs/verify-platform-mental-model.md`](../verify-platform-mental-model.md)
§5 (Security model — code format, OEM sharing, anti-abuse, honest limits)
and [`docs/core-code-format.md`](../core-code-format.md) (full code-format
spec) are the design source of truth this document maps onto running code.

## 1. Verify endpoint (consumer scans a code)

| STRIDE                 | Threat                                                                             | Mitigation                                                                                                             | Epic     |
| ---------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Spoofing               | Attacker submits a guessed/forged code                                             | Tier-2 payload is ≥100 bits crypto-random; checksum is HMAC-SHA256 keyed by the core key — unforgeable without it      | E01, E06 |
| Tampering              | Response is modified in transit to show a false verdict                            | TLS everywhere (production); verdict computed server-side, never client-editable                                       | E06      |
| Repudiation            | No record of who scanned what, when                                                | Every scan is an append-only `ScanEvent`                                                                               | E06      |
| Information disclosure | Full code echoed back lets an attacker screenshot a "genuine" result and replay it | Verify response shows verdict + partial code only, never the full code back                                            | E06      |
| Denial of service      | Enumeration / scraping floods the endpoint                                         | Per-IP sliding-window rate limit (E06) _and_ the tenant-wide fixed-window `QuotaService` fence (`scans_per_min`) (E13) | E06, E13 |
| Elevation of privilege | Scan endpoint used to infer tenant-internal data                                   | Tier-1 stays stateless (no tenant internals in the response); tier-2 requires the physical product                     | E01, E06 |

**Honest limit** (from the mental model, not hidden): a determined
counterfeiter can copy one real Tier-2 code onto many fakes. This system
_detects_ that via duplicate-scan history — it does not and cannot
_prevent_ someone photographing a code off a genuine unit. Detection is the
product, not prevention of physical copying.

## 2. Mint path (brand mints a batch of codes)

| STRIDE                 | Threat                                                               | Mitigation                                                                                                                                                                | Epic     |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Spoofing               | Non-owner mints codes for a tenant they don't control                | Auth + RBAC gates the mint route; tenant id comes only from `@TenantId()`, never client input                                                                             | E02, E04 |
| Tampering              | Minted codes altered after generation, before storage                | DB stores HMAC-SHA256(code) only — even a DB write path compromise can't retroactively "fix" a code to validate                                                           | E01, E04 |
| Repudiation            | No record of who minted what                                         | Mint is an `@Audited()` action (`batch.mint`) — hash-chained, append-only                                                                                                 | E13      |
| Information disclosure | Raw tier-2 code logged or returned outside the manifest              | Raw codes are never persisted or logged anywhere except inside the signed manifest object; `AuditService`'s `REDACT_KEYS` includes `code`/`tier2Code` as defense in depth | E01, E13 |
| Denial of service      | Mint flooding exhausts a shared resource                             | `QuotaService`'s `mints_per_day` tenant-wide fence                                                                                                                        | E13      |
| Elevation of privilege | A quota-exceeded tenant works around the fence via a different route | `assertWithinQuota()` is the one chokepoint; every mint-adjacent route calls it, not an ad-hoc check                                                                      | E04, E13 |

## 3. Manifest delivery (codes handed to an OEM for printing)

| STRIDE                 | Threat                                                            | Mitigation                                                                                                                                               | Epic     |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Spoofing               | A non-verified party receives a manifest                          | Delivered only over an authenticated channel to a verified OEM account                                                                                   | E05      |
| Tampering              | Manifest contents altered between signing and printing            | Manifest is signed (brand key); OEM returns a receipt hash as cryptographic proof of what was actually printed                                           | E01, E05 |
| Repudiation            | OEM later denies receiving/printing a given batch                 | Signed manifest + returned receipt hash is the non-repudiation artifact; manifest delivery is itself an `@Audited()` action                              | E05, E13 |
| Information disclosure | Manifest (raw codes) leaked in transit or at rest at the OEM      | Authenticated channel in transit; at rest is the OEM's own responsibility — out of this platform's control by design (documented limit, not solved here) | E05      |
| Denial of service      | N/A — not a high-value DoS target relative to the verify endpoint |                                                                                                                                                          |          |
| Elevation of privilege | OEM account used to mint or access another tenant's manifests     | OEM accounts are scoped to the tenant(s) that granted them; tenant isolation enforced the same way as brand accounts                                     | E02, E05 |

## 4. Admin console (tenant staff manage batches, view analytics, flag units)

| STRIDE                 | Threat                                                                             | Mitigation                                                                                                                                                                | Epic     |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Spoofing               | Session hijacking / credential stuffing                                            | Own auth (email+password, JWT access/refresh), TOTP MFA                                                                                                                   | E02      |
| Tampering              | XSS/CSRF used to perform actions as a logged-in operator                           | Nonce-based CSP with `strict-dynamic` (blocks unauthorized inline/external scripts), `frame-ancestors: none`; SameSite cookies (E02)                                      | E02, E13 |
| Repudiation            | No record of console actions (suspend a tenant, flag a unit, etc.)                 | Every mutating console action is `@Audited()`                                                                                                                             | E13      |
| Information disclosure | Clickjacking, MIME-sniffing, referrer leakage of sensitive URLs                    | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`SECURITY_HEADERS`, applied via helmet + Next middleware) | E13      |
| Denial of service      | Console API flooded via a compromised/scripted session                             | `api_calls_per_min` tenant-wide `QuotaService` fence                                                                                                                      | E13      |
| Elevation of privilege | Viewer/operator role performs an owner-only action (e.g. triggering `verifyChain`) | RBAC gates on every route (`owner\|operator\|viewer`); `POST /v1/audit/chain/verify` is owner-only                                                                        | E02, E13 |

## 5. The audit log itself (the thing that's supposed to catch everything above)

An audit log that can be silently edited is worse than no audit log — it's
false confidence. This surface gets its own row set because it's the
control that every other section above leans on for repudiation.

| STRIDE                 | Threat                                                                                      | Mitigation                                                                                                                                                                                     | Epic |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Spoofing               | A fabricated row is inserted to manufacture a false trail                                   | Every row's hash covers `prevHash` — a fabricated row breaks the chain from that point forward, caught by `verifyChain()`                                                                      | E13  |
| Tampering              | An `UPDATE`/`DELETE` against `AuditLog` after the fact (insider, or a compromised app role) | Postgres trigger (`audit_log_immutable`) unconditionally raises on `UPDATE`/`DELETE`, regardless of role — plus `REVOKE UPDATE, DELETE` from the app role as defense in depth                  | E13  |
| Repudiation            | A superuser bypasses the trigger directly (`ALTER TABLE ... DISABLE TRIGGER`)               | Can't be fully prevented at the DB layer (a superuser can always do this) — `verifyChain()` (run on a schedule _and_ on demand) detects the resulting hash mismatch and surfaces `firstBadSeq` | E13  |
| Information disclosure | A tier-2 code, password, or token ends up in the audit payload                              | `REDACT_KEYS` (`password`, `token`, `secret`, `code`, `tier2Code`, `authorization`) redacts before hashing _and_ storage — a leaked `AuditLog` row never contains raw secret material          | E13  |
| Denial of service      | Audit writes block the request path under load                                              | Chain-head lock is a single-row `SELECT ... FOR UPDATE` — serializes writes but doesn't block reads; acceptable at expected mint/scan volumes, revisit if profiling says otherwise             | E13  |
| Elevation of privilege | A non-support user reads another tenant's audit log                                         | `GET /v1/audit` is tenant-scoped; only `GET /v1/support/audit` (platform `support` role) crosses tenants                                                                                       | E13  |

**Honest limit**: the trigger stops the _application_ from tampering. It
cannot stop someone with direct superuser Postgres access from disabling
the trigger, editing a row, and re-enabling it — no software control can,
against that threat model. `verifyChain()` is the detective control for
exactly that scenario: it doesn't prevent the edit, it makes it
un-hideable after the fact.

## Encryption at rest

Compose (local/dev): Postgres and MinIO data live on Docker-managed
volumes on the host disk, unencrypted at the platform layer. This is a
known, accepted limit for local development — it is **not** a production
posture.

Production expectation (not implemented here — no cloud infra is in scope
for any epic): the hosting provider's volume-level encryption (e.g. AWS EBS
encryption, RDS encryption-at-rest) should be enabled for the Postgres and
object-storage volumes. This platform doesn't implement its own
application-layer encryption for data at rest beyond what's already
described above (hashed codes, HMAC'd checksums) — full-disk/volume
encryption is treated as infrastructure the deployment target provides.

## Incident response outline

1. **Detect**: `verifyChain()`'s scheduled check (or an ad-hoc
   `POST /v1/audit/chain/verify`) reporting `ok: false`, a security alert
   from CodeQL/gitleaks/`pnpm audit`, or an external report (see
   `SECURITY.md`).
2. **Contain**: rotate the affected credential immediately
   (`docs/security/key-rotation-runbook.md` for the core signing key);
   suspend the affected tenant/account if the incident is tenant-specific.
3. **Assess**: for a confirmed audit-log tamper, `verifyChain()`'s
   `firstBadSeq` bounds the affected range — query `AuditLog` from that
   `seq` forward to scope what may be unreliable.
4. **Notify**: where personal data of Nigerian data subjects is affected,
   NDPR requires notification to NITDA (and affected subjects, where risk
   is material) **within 72 hours** of becoming aware. Where UK/EU data
   subjects are affected, UK GDPR/EU GDPR carries the same 72-hour
   notification expectation to the relevant supervisory authority. This
   platform does not yet have an automated notification pipeline (E19
   Compliance & Data Governance owns building one) — until then, this is a
   manual process the team must execute directly.
5. **Recover**: redeploy with the rotated credential; if a kid was
   compromised, follow the retirement checklist in
   `docs/security/key-rotation-runbook.md` once no live unit references it.
6. **Review**: record what happened and what changed as a result — this
   platform doesn't yet have a dedicated postmortem template; use whatever
   the team's standard incident write-up process is until one exists here.
