# verifynNG — Epic Map

Source of truth for how the Verify Platform gets built to production grade by multiple agents working in parallel. Each epic is one file in this directory and one GitHub Issue (label `epic`). The design docs that motivate everything are in `../`:

- `verify-platform-mental-model.md` — domain model, two-tier code design, security model
- `verify-platform-architecture.md` — 12 incremental steps
- `verify-platform-production-readiness.md` — the P0/P1/P2 checklist these epics implement

Target: **everything works end-to-end in `docker compose up`** with local fakes for every external service. Cloud infra is out of scope for every epic.

## Stack (decided 2026-08-28)

| Layer                           | Choice                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Monorepo                        | pnpm workspaces + Turborepo                                                                                      |
| API                             | NestJS (TypeScript) + Prisma + PostgreSQL 16                                                                     |
| Jobs / cache / rate limits      | Redis 7 + BullMQ                                                                                                 |
| Consumer web                    | `apps/web-verify` — Next.js (App Router), mobile-first, SSR                                                      |
| Tenant console                  | `apps/web-admin` — Next.js (App Router)                                                                          |
| Shared                          | `packages/core` (pure code engine), `packages/db` (Prisma), `packages/ui`, `packages/config`                     |
| Auth                            | Own: email+password, JWT access/refresh, TOTP MFA, RBAC (owner/operator/viewer). SSO later (E20)                 |
| Object storage                  | S3 API — MinIO locally                                                                                           |
| Email / SMS / Payments / Geo-IP | Adapter ports. Real: Resend / Termii / Paystack / MaxMind. Local fakes: Mailpit / fake-sms / fake-pay / fake-geo |
| Observability                   | OpenTelemetry → Grafana + Loki + Tempo (compose)                                                                 |
| Tests                           | Vitest (unit/integration against real Postgres), Playwright (E2E), k6 (load)                                     |

## Repo layout

```
apps/api            NestJS — one module per feature epic under src/modules/<name>/
apps/web-verify     consumer verification + product pages
apps/web-admin      tenant console (+ OEM and platform-support roles)
packages/core       code engine — zero I/O, zero framework
packages/db         prisma/schema.prisma, migrations, seed
packages/ui         shared React components + design tokens
packages/config     env schema, shared tsconfig/eslint
tools/fakes/*       fake-sms, fake-pay, fake-geo services used by compose
docker/             compose files, Dockerfiles
docs/epics/         this directory
legacy/             the milestone-1 JS prototype — reference only, never imported
```

## Waves and dependency graph

```
Wave 0 (sequential)   E00 Foundation ──► E01 Code Engine
                                  │
Wave 1 (parallel)     E02 Identity   E03 Tenant Lifecycle   E04 Catalog & Minting
                      E06 Verification   E11 Admin Shell   E13 Audit & Hardening   E14 Notifications
                                  │
Wave 2 (parallel)     E05 OEM Manifest   E07 Anomaly   E08 Fake Reporting   E09 Verify Web
                      E12 Analytics   E17 Observability   E19 Compliance
                                  │
Wave 3 (parallel)     E10 Product Pages   E15 Billing   E16 Public API & Webhooks
                      E18 Support Tooling   E20 SSO
Cross-cutting         E21 Quality Engineering (starts wave 1, owns the CI matrix to the end)
```

| ID                                       | Epic                                | Wave | Depends on         | Readiness items                                   |
| ---------------------------------------- | ----------------------------------- | ---- | ------------------ | ------------------------------------------------- |
| [E00](E00-foundation.md)                 | Foundation & Dev Platform           | 0    | —                  | §4 env separation, CI/CD, §11 test suite scaffold |
| [E01](E01-code-engine.md)                | Code Engine                         | 0    | E00                | §2 key rotation, §11 engine tests                 |
| [E02](E02-identity-access.md)            | Identity & Access                   | 1    | E01                | §1 all P0/P1                                      |
| [E03](E03-tenant-lifecycle.md)           | Tenant Lifecycle                    | 1    | E02 (interfaces)   | §8, §3 AUP                                        |
| [E04](E04-catalog-minting.md)            | Catalog & Minting                   | 1    | E01                | arch steps 2, 6                                   |
| [E06](E06-verification-scan-events.md)   | Verification & Scan Events          | 1    | E01                | arch steps 1, 3, 4, 8; §2 rate limits             |
| [E11](E11-admin-shell.md)                | Admin Console Shell & Design System | 1    | E02 (interfaces)   | —                                                 |
| [E13](E13-audit-security.md)             | Audit Log & Security Hardening      | 1    | E00                | §2                                                |
| [E14](E14-notifications.md)              | Notifications                       | 1    | E00                | §6                                                |
| [E05](E05-oem-manifest.md)               | OEM Manifest Delivery               | 2    | E04, E14           | arch step 5                                       |
| [E07](E07-anomaly-detection.md)          | Anomaly Detection & Unit Lifecycle  | 2    | E06, E14, E13      | arch step 9                                       |
| [E08](E08-consumer-reporting.md)         | Consumer Fake Reporting             | 2    | E06, E11           | arch step 10                                      |
| [E09](E09-verify-web.md)                 | Consumer Verify Web                 | 2    | E06                | arch step 1                                       |
| [E12](E12-analytics-metering.md)         | Analytics & Usage Metering          | 2    | E06, E04, E11      | §7 metering, arch step 8                          |
| [E17](E17-observability.md)              | Observability                       | 2    | E00                | §5, arch step 11                                  |
| [E19](E19-compliance-data-governance.md) | Compliance & Data Governance        | 2    | E02, E06           | §3                                                |
| [E10](E10-product-pages.md)              | Product Pages & Page Builder        | 3    | E09, E04, E11      | arch step 12                                      |
| [E15](E15-billing-entitlements.md)       | Billing & Entitlements              | 3    | E12, E03, E14      | §7                                                |
| [E16](E16-public-api-webhooks.md)        | Public API & Webhooks               | 3    | E02, E04, E06, E07 | §10                                               |
| [E18](E18-support-tooling.md)            | Support Tooling                     | 3    | E02, E13, E11      | §9                                                |
| [E20](E20-sso.md)                        | SSO & MFA Policy                    | 3    | E02                | §1 P1/P2                                          |
| [E21](E21-quality-engineering.md)        | Quality Engineering                 | 1→3  | E00                | §11                                               |

## Working agreement for agents

Any agent (Claude, Codex, Pi, a human) picking up an epic follows this. It is also in `/AGENTS.md`.

1. **Claim it.** Assign yourself the epic's GitHub Issue, set `Owner` and `Status: in-progress` in the epic file, push that one-line change to `main` via PR. First claim wins.
2. **Isolate.** `scripts/epic start EXX` (creates `../verifynNG-EXX` on `epic/EXX-<slug>` and writes its `.env` with a private compose project + port offset). One epic, one worktree, one long-lived branch, one Docker stack. Small PRs from that branch into `main` are encouraged; the epic is done when its acceptance criteria all pass on `main`.
3. **Stay inside owned paths.** Each epic lists the paths it owns. Touching another epic's paths requires a comment on that epic's issue first. Shared hot-spots have rules below.
4. **Never break `main`.** CI (lint, typecheck, unit + integration, build, `docker compose config`) must be green. `main` must always `docker compose up` cleanly.

   > **Temporary (from 2026-08-28): GitHub Actions is unavailable (account billing lock), so `main` has no required CI checks.** Until it's restored, "CI green" means: you ran `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and `pnpm test:e2e` against `docker compose up` locally and pasted the output in the PR. A Husky `pre-push` hook enforces the first four. CI becomes required again before the wave-1 fan-out; this note is deleted then.

5. **Consume interfaces, not internals.** Each epic publishes the interfaces it exposes (Nest providers, events, DB models, HTTP routes). Depend on those. If you need something an upstream epic hasn't shipped, stub behind the published interface and open an issue.
6. **Tests are part of the epic.** Unit tests for logic, integration tests against real Postgres for anything touching the DB, one Playwright flow per user-facing acceptance criterion. No mocking of things we own.
7. **Verify in Docker before claiming done.** Run the acceptance criteria against `docker compose up`, paste the evidence (command output, screenshot) in the issue.
8. **Tick the checklist.** Task checkboxes in the issue are updated as PRs merge. Close the issue only when every acceptance criterion is demonstrated.

### Shared hot-spot rules

| Hot-spot                             | Rule                                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`   | Additive only. Add your models/fields in a clearly commented block named after your epic. One migration per PR, named `EXX_<what>`. Never edit another epic's models — propose via issue. Rebase on `main` before every PR. |
| `apps/web-admin` navigation & routes | E11 owns the shell and the nav registry. Other epics add a route group under `app/(console)/<feature>/` and register one nav entry in `nav.config.ts`.                                                                      |
| `packages/config` env schema         | Add your variables under a section comment for your epic; provide a compose default so `docker compose up` works with no `.env`.                                                                                            |
| `docker/compose.yml`                 | Add services only if your epic's file lists them. Never change ports of existing services.                                                                                                                                  |
| `packages/core`                      | E01 owns it. Other epics may only add pure functions with 100% test coverage, via PR reviewed by E01's owner.                                                                                                               |
| Nest `AppModule`                     | Import your module in one line; no other edits.                                                                                                                                                                             |
| Events                               | Cross-epic communication is via domain events on the Nest `EventEmitter` (in-process) or BullMQ queues (async). Event names and payloads are declared in the publishing epic's file under "Interfaces exposed".             |

### Branch and commit conventions

- Branch: `epic/EXX-<slug>`; sub-branches `epic/EXX-<slug>/<task>` are fine.
- Conventional commits, scope = epic id: `feat(E06): tier-2 verdict engine`.
- PR title carries the epic id. PR body lists which checklist items it completes.

## Cross-epic requests

Interfaces one epic asked another to provide are consolidated in [`CROSS-EPIC-REQUESTS.md`](CROSS-EPIC-REQUESTS.md). Check your epic's section there when you claim it and fold the items into your task list.

## Status legend used in epic files

`todo` · `in-progress` · `blocked` · `review` · `done`
