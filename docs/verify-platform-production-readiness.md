# Verify Platform — Production Readiness Blueprint

**Companion to:** `verify-platform-mental-model.md` (what we're building) and `verify-platform-architecture.md` (incremental steps 1–12). This doc lists **everything else** a real multi-tenant SaaS needs — researched against current industry checklists (SaaS tenancy guides, OWASP, NIST/ISO control mapping, NDPR/NDPA for Nigeria, UK GDPR).

**Priority legend:**
- 🔴 **P0 — launch blockers** (platform is fake without these)
- 🟡 **P1 — needed within ~3 months of first paying tenant**
- 🟢 **P2 — scale/enterprise-grade**

---

## 1. Identity & Access Management

| Item | Detail | Pri |
|---|---|---|
| Tenant-aware authN | Server-verified tenant context on every session — never trust a client-supplied tenant ID | 🔴 |
| Real IdP for admin console | Replace local password (currently `admin`) — email/password + MFA via Firebase Auth (already proven in this repo's storefront) | 🔴 |
| Roles (RBAC) | Owner / Operator / Viewer per tenant. Killing codes and minting batches = owner-only | 🔴 |
| Password reset, session expiry/revocation | Standard flows, device tracking | 🔴 |
| Service-to-service auth | Background jobs, webhooks, OEM endpoints must carry tenant context explicitly | 🟡 |
| MFA enforcement option | Per-tenant policy | 🟡 |
| SSO (Google/Microsoft) | Enterprise tenants will ask | 🟢 |

## 2. Security (beyond the code engine we already have)

| Item | Detail | Pri |
|---|---|---|
| TLS everywhere, HSTS, security headers, CSP | Non-negotiable for a *trust* product | 🔴 |
| Secrets management | Move HMAC secret out of `data/.secret` file into a managed vault (Firebase Secret Manager / Cloudflare Secrets) + rotation procedure | 🔴 |
| Audit log (tamper-evident) | Who minted/flagged/killed what, when — append-only, admin-visible | 🔴 |
| Per-tenant rate limits & quotas | Beyond our current per-IP limit — plan-tier enforcement, noisy-neighbor protection | 🔴 |
| Dependency/secret scanning in CI | `npm audit`, secret scanning on commits | 🟡 |
| Vulnerability management & pen test | Annual pentest once real tenants onboard; fix SLAs by severity | 🟡 |
| Cross-tenant isolation tests in CI | Automated attempts to read/write across tenants must fail | 🔴 |
| Encryption at rest for tenant data | Provider-native (Firestore/Autokit encryption) + document it | 🟡 |
| Incident response plan | Written, rehearsed; breach notification flows for NDPR (72h) and UK GDPR | 🟡 |
| Key rotation for HMAC signing key | Operational runbook (rotate without invalidating live codes — versioned keys) | 🟡 |

## 3. Compliance & Legal

| Item | Detail | Pri |
|---|---|---|
| Privacy policy + ToS (platform) | Consumer scan pages collect IP/geo/device data — must be disclosed | 🔴 |
| NDPR/NDPA (Nigeria) | Nigerian users' data in scope regardless of server location: data mapping, lawful basis, retention schedule, consent records. Register with NDPC when required | 🔴 |
| UK GDPR track | Ivory Glow codes are UK-formulated; UK tenant data needs its own review | 🟡 |
| DPAs with every subprocessor | Hosting, geo-IP, email, SMS, payments — signed processor agreements | 🟡 |
| Data retention & deletion policy | How long scan events are kept (they're the anti-counterfeit evidence — long), consumer PII (IP/geo — short), tenant data at offboarding | 🟡 |
| Acceptable Use Policy | No counterfeiter may use the platform to "authenticate" fakes — tenant verification is the gate | 🔴 |
| Subprocessor list public | Trust-product expectation | 🟢 |
| ISO 27001 / SOC 2 | Enterprise trust tier, only when revenue justifies | 🟢 |

## 4. Infrastructure & Operations

| Item | Detail | Pri |
|---|---|---|
| Real hosting | Firebase (Functions + Firestore + Hosting) or Cloudflare Workers — store interface already abstracted for this swap | 🔴 |
| Custom domain + DNS | e.g. `verify.tunnellight.com` or platform brand domain; QR codes are printed permanently — domain MUST be stable and owned long-term | 🔴 |
| Environment separation | dev / staging / prod — QR codes printed against prod URL only | 🔴 |
| CI/CD | GitHub Actions: test → build → deploy staging → manual gate → prod | 🟡 |
| Backups + restore drills | Firestore scheduled exports; test restores quarterly | 🟡 |
| Blue/green or canary deploys | Verification API downtime = consumers see "counterfeit" — deploy without downtime | 🟡 |
| IaC | Terraform/OpenTofu once infra > 1 service | 🟢 |
| Multi-region failover | Later; document RTO/RPO targets first | 🟢 |

## 5. Observability

| Item | Detail | Pri |
|---|---|---|
| Centralized logs with tenant context | Every log line carries tenant ID + request ID | 🔴 |
| Error tracking | Sentry (free tier) on API + pages | 🔴 |
| Uptime monitoring + alerting | External probe on `/api/health`; alert to WhatsApp/email — verification is a 24/7 trust surface | 🔴 |
| Core metrics | Scan latency, error rate, verdict distribution, rate-limit hits, per-tenant volume | 🟡 |
| SLOs + status page | Public status page (`status.<domain>`) — trust product must be transparent | 🟡 |
| Tracing | When services multiply | 🟢 |

## 6. Notifications & Alerts

| Item | Detail | Pri |
|---|---|---|
| Transactional email (Resend) | Already integrated in the storefront codebase — reuse: tenant welcome, batch minted, manifest delivered, suspicious-scan alerts | 🔴 |
| SMS (Termii / Africa's Talking) | Nigeria: consumer verification fallback via SMS/USSD is a real differentiator; also OTP for admin MFA | 🟡 |
| Alert routing | Suspicious-scan anomalies → tenant owner (email + optionally WhatsApp); system incidents → us | 🔴 |
| Deliverability hygiene | DKIM/SPF/DMARC, bounce handling, suppression lists | 🔴 |
| Tenant-branded notifications | Sender identity per tenant | 🟢 |

## 7. Billing & Monetization

| Item | Detail | Pri |
|---|---|---|
| Pricing model decision | e.g. tiers by units/year + per-scan overage; metering = scan events + codes minted (we already log both) | 🟡 |
| Payment gateway | **Paystack or Flutterwave** (Nigeria + UK coverage, handles business verification/CAC docs); Stripe later for global | 🟡 |
| Plans, trials, upgrades/downgrades | Trial tier: e.g. 500 codes free | 🟡 |
| Usage metering separated from pricing | Bill events ≠ price — record raw, price separately | 🟡 |
| Invoicing, dunning, failed payments | Retry + reminder flow | 🟡 |
| Entitlement enforcement | Plan limits enforced at mint time (units/year cap) | 🟡 |

## 8. Tenant Lifecycle

| Item | Detail | Pri |
|---|---|---|
| Onboarding flow | Signup → business verification (CAC docs, like Paystack KYC) → tenant provisioned → welcome | 🟡 |
| Tenant identity verification | **Critical for us:** the platform's credibility depends on not authenticating counterfeiters' goods. Trademark registration (like Ivory Glow's NG/TM/O/2020/11950) as the model artifact | 🔴 |
| Suspension / reactivation | Failed payment → restricted mode (verify still works for consumers; minting blocked) | 🟡 |
| Offboarding | Data export, deletion per policy, decommission tenant QR namespace | 🟡 |
| Tenant migration | Plan/region changes without data loss | 🟢 |

## 9. Support & Success

| Item | Detail | Pri |
|---|---|---|
| Support intake | Simple: shared mailbox + form → proper helpdesk as tenants grow | 🟡 |
| Admin impersonation tooling | Support can view tenant's view — audited, never unaudited | 🟡 |
| Runbooks | Onboarding failure, auth problems, payment failure, cross-tenant alert, restore | 🟡 |
| Public docs / FAQ | How codes work, how to apply labels, printer specs | 🟡 |
| Self-service | Status page, billing portal, API key management | 🟢 |

## 10. API Platform (future tenants/OEM integrations)

| Item | Detail | Pri |
|---|---|---|
| Public API + keys | Tenants/OEMs integrate minting & verification into their ERP | 🟢 |
| Signed webhooks | `scan.suspicious`, `unit.flagged`, `batch.printed` events to tenant endpoints — signed, retried, idempotent | 🟢 |
| Versioned API + OpenAPI docs | Deprecation policy | 🟢 |

## 11. Quality Engineering

| Item | Detail | Pri |
|---|---|---|
| Test suite for the code engine | Crypto/checksum edge cases, verdict state machine — pure functions, easy to test | 🔴 |
| Isolation + lifecycle integration tests | Cross-tenant access must fail; create→suspend→delete flows | 🟡 |
| Load testing | Verify endpoint is the hot path — must survive a product launch spike (thousands of scans in hours) | 🟡 |
| Chaos/failover drills | Backup restores, region failure | 🟢 |

---

## P0 summary — the true launch list

1. **Real hosting + owned domain** (QR codes are permanent — domain choice is a 10-year decision)
2. **Real admin auth + roles** (Firebase Auth)
3. **Audit log + secrets in a vault + TLS**
4. **Privacy policy + ToS + NDPR basics** (scan pages collect IP/geo)
5. **Tenant identity verification gate** (our AUP is only as strong as onboarding)
6. **Error tracking + uptime alerts**
7. **Cross-tenant isolation tests + engine test suite**
8. **Transactional email wired for alerts** (reuse Resend)

Everything else follows tenants and revenue.

---

## Nigeria/UK operational notes

- **Payments:** Paystack/Flutterwave both require business verification (CAC docs, director ID, settlement bank) before live mode — align account name, business name, and website before applying.
- **SMS:** Termii/Africa's Talking for OTP + consumer verification fallback; keep transactional vs promotional traffic separate (NDPR consent rules); design OTP retry + fallback delivery.
- **Data:** NDPR applies to Nigerian users regardless of hosting location. Data inventory + retention schedule + DPAs with every subprocessor. UK GDPR runs in parallel for UK tenant data.
- **Identity artifacts for KYC:** CAC documents, government ID, BVN where financial; exact-name matching matters.
