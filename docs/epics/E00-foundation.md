# E00 — Foundation & Dev Platform

|                 |                                                               |
| --------------- | ------------------------------------------------------------- |
| Wave            | 0                                                             |
| Status          | done                                                          |
| Owner           | enendufrankc                                                  |
| GitHub Issue    | [#1](https://github.com/enendufrankc/verifynNG/issues/1)      |
| Depends on      | —                                                             |
| Unblocks        | everything                                                    |
| Readiness items | §4 environment separation, CI/CD · §11 test suite scaffolding |

## Goal

A monorepo where `pnpm install && docker compose up` brings up Postgres, Redis, MinIO, Mailpit, the fake external services, an empty-but-running NestJS API with a health endpoint, and two Next.js apps showing placeholder pages — with CI that lints, typechecks, tests and builds every package. Every other epic starts from this skeleton; nothing here implements product behaviour.

## Scope

**In:** monorepo tooling, Docker compose stack, Nest/Next skeletons, Prisma base schema shared by many epics, env validation, test runners, CI, agent working agreement docs.

**Out:** the code engine (E01), any auth (E02), any real module logic, observability beyond a health check (E17), the fake services' business logic beyond "starts and answers" (owned by E14 for sms/email, E15 for pay, E06 for geo).

## Owned paths

```
/ (root configs: package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .editorconfig, .nvmrc)
.github/workflows/**
docker/**
packages/config/**
packages/db/prisma/schema.prisma            (base models block "E00")
packages/db/src/**                          (client export, test helpers)
apps/api/src/{main.ts,app.module.ts,health/**}
apps/web-verify/**                          (skeleton only; handed to E09 on completion)
apps/web-admin/**                           (skeleton only; handed to E11 on completion)
tools/fakes/*/Dockerfile + stub servers
AGENTS.md, CLAUDE.md, CONTRIBUTING.md
```

## Interfaces

**Consumes:** nothing.

**Exposes:**

- `packages/config`: `loadEnv()` returning a Zod-validated typed env; `Env` type. Sections per epic.
- `packages/db`: `prisma` client singleton; `createTestDatabase()` helper that provisions an isolated schema per test file and runs migrations (used by every integration test in the repo).
- Base Prisma models (below).
- Nest: `AppModule` with `ConfigModule`, `PrismaModule`, `HealthModule`; global `ValidationPipe` (whitelist + transform); `@TenantId()` decorator _placeholder_ that E02 will back with real auth.
- Compose service names/ports (see below) — fixed contract for all epics.
- CI job names: `lint`, `typecheck`, `test`, `build`, `compose-config`.

## Data model

Base models every wave-1 epic extends additively. Keep them minimal; owning epics add fields.

```prisma
model Tenant     { id, slug @unique, name, legalName?, status (enum: pending|active|suspended|offboarded), createdAt, updatedAt }
model User       { id, tenantId?, email @unique, passwordHash?, displayName, createdAt, updatedAt }   // E02 adds MFA/roles
model Product    { id, tenantId, sku, name, gtin?, createdAt }
model Oem        { id, tenantId, name, country?, createdAt }
model Batch      { id, tenantId, productId, oemId?, count, status, createdAt }
model Unit       { id, tenantId, batchId, tier1Code @unique, tier2Hash @unique, state (enum: active|flagged|decommissioned), createdAt }
model ScanEvent  { id, tenantId, unitId?, tier, verdict, ip?, geoCountry?, geoCity?, userAgent?, createdAt }  // append-only, E06 owns semantics
model AuditLog   { id, tenantId?, actorId?, action, target, payload Json, prevHash?, hash, createdAt }         // E13 owns semantics
```

All tenant-owned tables get a composite index starting with `tenantId`.

## Tasks

- [ ] T1 Init monorepo: pnpm workspaces, Turborepo pipeline (`lint`, `typecheck`, `test`, `build`, `dev`), shared `tsconfig.base.json`, ESLint (typescript-eslint, import order) + Prettier, `.nvmrc` = Node 22 LTS, Husky pre-commit running lint-staged.
- [ ] T2 `packages/config`: Zod env schema, `loadEnv()`, `.env.example` with compose defaults; fails fast on missing vars.
- [ ] T3 `packages/db`: Prisma init, base schema above, first migration `E00_base`, `prisma` singleton, `createTestDatabase()` helper, `pnpm db:migrate / db:reset / db:seed` scripts, seed that creates the `ivoryglow` tenant + its three products from `legacy/verify-platform/cli.js`.
- [ ] T4 `apps/api`: NestJS skeleton with `ConfigModule` (from packages/config), `PrismaModule`, `HealthModule` (`GET /health` → db + redis ping), global validation pipe, request-id middleware, Dockerfile (multi-stage, non-root).
- [ ] T5 `apps/web-verify` and `apps/web-admin`: Next.js 15 App Router skeletons, Tailwind, one placeholder page each, Dockerfiles, `NEXT_PUBLIC_API_URL` wiring, `/api/health` proxy check on the page.
- [ ] T6 `docker/compose.yml` (+ `compose.dev.yml` override with bind mounts + hot reload): postgres 16, redis 7, minio + `mc` bucket init, mailpit, `fake-sms`, `fake-pay`, `fake-geo` (stub HTTP servers under `tools/fakes/`, each with a `/health`), api, web-verify, web-admin. Healthchecks + `depends_on: condition: service_healthy`. Named volumes. Fixed ports table below.
- [ ] T7 Test tooling: Vitest workspace config, integration test example hitting real Postgres via `createTestDatabase()`, Playwright config with one smoke test per web app, `pnpm test`, `pnpm test:e2e`.
- [ ] T8 GitHub Actions: `ci.yml` on PR + push to main — pnpm cache, `lint`, `typecheck`, `test` (Postgres + Redis service containers), `build`, `docker compose config` validation, Playwright smoke against compose. Branch protection on `main` requiring CI.
- [ ] T9 Docs: `AGENTS.md` (working agreement from `docs/epics/README.md`, commands, hot-spot rules), `CLAUDE.md` = `@AGENTS.md`, `CONTRIBUTING.md` (worktree flow, PR checklist), root `README.md` quickstart.
- [ ] T10 Hand-off: open the wave-1 epic issues for claiming; mark E00 done.

## Acceptance criteria

- [ ] AC1 Fresh clone, `pnpm install && docker compose -f docker/compose.yml up -d` → all services healthy within 2 minutes (`docker compose ps` shows `healthy` for every service).
- [ ] AC2 `curl localhost:4000/health` → `{"status":"ok","db":"up","redis":"up"}`.
- [ ] AC3 `http://localhost:3000` (web-verify) and `http://localhost:3001` (web-admin) render placeholder pages that display the API health result.
- [ ] AC4 `pnpm db:seed` creates tenant `ivoryglow` with 3 products; visible via `pnpm prisma studio`.
- [ ] AC5 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green locally; same jobs green in GitHub Actions on a PR.
- [ ] AC6 `pnpm test:e2e` runs the two Playwright smoke tests against the compose stack.
- [ ] AC7 A second epic can add a Nest module, a Prisma model + migration, and a web-admin route group following `AGENTS.md` without editing any E00-owned file other than `schema.prisma` (additive) and `app.module.ts` (one import line). Prove it with a throwaway branch, then delete it.

## Testing

- Integration test proving `createTestDatabase()` isolates schemas across parallel test files.
- Playwright smoke: each web app loads and shows "API: ok".
- CI must run the integration test against the service-container Postgres.

## Compose services added

| Service    | Image              | Host port                 |
| ---------- | ------------------ | ------------------------- |
| postgres   | postgres:16-alpine | 5432                      |
| redis      | redis:7-alpine     | 6379                      |
| minio      | minio/minio        | 9000 (S3), 9001 (console) |
| mailpit    | axllent/mailpit    | 8025 (UI), 1025 (SMTP)    |
| fake-sms   | tools/fakes/sms    | 4101                      |
| fake-pay   | tools/fakes/pay    | 4102                      |
| fake-geo   | tools/fakes/geo    | 4103                      |
| api        | apps/api           | 4000                      |
| web-verify | apps/web-verify    | 3000                      |
| web-admin  | apps/web-admin     | 3001                      |

Later epics add more services; the full port registry is in `CROSS-EPIC-REQUESTS.md` (E17 observability on 3100–3105, fakes on 4104–4106, docs on 3002).

## Notes and decisions

- Node 22 LTS, pnpm 9, Next.js 15, NestJS 11, Prisma 6 — pin exact versions in the lockfile; upgrade via dedicated PRs.
- The legacy JS prototype under `legacy/` is never imported by any package; it exists so agents can read the milestone-1 behaviour.
- **Branch protection (T8)** is unavailable on a private free-plan repo — GitHub requires Pro or public visibility for required status checks. Options: (a) make the repo public, (b) upgrade to Pro, or (c) rely on convention + Husky pre-push hook until CI billing is resolved. Decision deferred to repo owner.
- **CI (T8)** is waived while GitHub Actions is unavailable due to account billing lock. A Husky `pre-push` hook enforces `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. CI becomes required before wave-1 fan-out.
