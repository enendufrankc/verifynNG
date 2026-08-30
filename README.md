# verifynNG — Verify Platform

Multi-tenant product-authenticity platform. Brands mint cryptographically secure unit codes, deliver them to verified manufacturers as signed manifests, and consumers scan a QR code to verify a physical product. First tenant: IVORY GLOW (Tunnel Light Global Concept Ltd).

**Status:** planning complete; the TypeScript rewrite is being built epic-by-epic by parallel agents. See [`docs/epics/README.md`](docs/epics/README.md).

## Start here

| If you want to…                                     | Read                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Understand the product and the two-tier code design | [`docs/verify-platform-mental-model.md`](docs/verify-platform-mental-model.md)                                       |
| See the incremental architecture (12 steps)         | [`docs/verify-platform-architecture.md`](docs/verify-platform-architecture.md)                                       |
| See what "production grade" means here              | [`docs/verify-platform-production-readiness.md`](docs/verify-platform-production-readiness.md)                       |
| Pick up work as an agent or engineer                | [`AGENTS.md`](AGENTS.md) → [`docs/epics/README.md`](docs/epics/README.md)                                            |
| See the running milestone-1 prototype               | [`legacy/verify-platform/`](legacy/verify-platform/) (`npm i && node cli.js setup && node cli.js mint && npm start`) |
| Report a vulnerability, or see the security model   | [`SECURITY.md`](SECURITY.md) → [`docs/security/threat-model.md`](docs/security/threat-model.md)                      |

## Stack

pnpm + Turborepo monorepo · NestJS + Prisma + PostgreSQL · Redis + BullMQ · Next.js (consumer `web-verify`, tenant console `web-admin`) · MinIO · OpenTelemetry/Grafana. Every external service (email, SMS, payments, geo-IP, OIDC) is a port with a local fake so the whole platform runs in `docker compose up`.

## Epics at a glance

Wave 0: E00 Foundation → E01 Code Engine
Wave 1: E02 Identity · E03 Tenant Lifecycle · E04 Catalog & Minting · E06 Verification · E11 Admin Shell · E13 Audit & Security · E14 Notifications

## Notifications

E14 exposes `NotificationService.send()` and routes delivery through the Postgres outbox and BullMQ worker. Local email uses Mailpit; SMS and WhatsApp use the fake service. See [`docs/notifications/templates.md`](docs/notifications/templates.md), [`deliverability.md`](docs/notifications/deliverability.md), and [`routing.md`](docs/notifications/routing.md). Run `pnpm notifications:preview` to preview the catalog on port 4110.
Wave 2: E05 OEM Manifest · E07 Anomaly Detection · E08 Fake Reporting · E09 Verify Web · E12 Analytics & Metering · E17 Observability · E19 Compliance
Wave 3: E10 Product Pages · E15 Billing · E16 Public API & Webhooks · E18 Support Tooling · E20 SSO
Cross-cutting: E21 Quality Engineering

Track progress on the [GitHub Project board](https://github.com/enendufrankc/verifynNG/projects) and the `epic`-labelled issues.

## Quickstart

```bash
pnpm install
docker compose -f docker/compose.yml up -d     # full local stack
pnpm db:migrate                                 # run Prisma migrations
pnpm db:seed                                    # seed ivoryglow tenant + 3 products
pnpm dev                                        # start all apps in dev mode
```

Working in an epic worktree? Ports differ per worktree — run `scripts/epic ports EXX`. Defaults (main clone, no `.env`):

- API: http://localhost:4000/health
- Verify web: http://localhost:3000
- Admin console: http://localhost:3001
- Mailpit: http://localhost:8025
- MinIO console: http://localhost:9001
