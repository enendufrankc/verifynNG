# Testing Strategy

## Test pyramid per package

| Package         | Unit (`*.spec.ts`)              | Integration (`*.int.ts`)                     | E2E (`*.e2e.ts`)        |
| --------------- | ------------------------------- | -------------------------------------------- | ----------------------- |
| `packages/core` | 100% — pure functions, zero I/O | —                                            | —                       |
| `packages/db`   | factory/RNG logic               | `createTestDatabase()` against real Postgres | —                       |
| `apps/api`      | per-module service logic        | against real Postgres + Redis                | —                       |
| `apps/web-*`    | component logic                 | —                                            | Playwright journeys     |
| `packages/sdk`  | client methods                  | —                                            | contract (Schemathesis) |

## What each layer may mock

- **Unit:** may mock external I/O boundaries (network, time). Never mock anything we own.
- **Integration:** hits real Postgres (via `createTestDatabase()`). Real Redis. May mock external adapters (email, SMS, payments) using compose fakes.
- **E2E:** full compose stack. No mocks at all.

## Naming conventions

- `*.spec.ts` — unit tests (fast, no I/O)
- `*.int.ts` — integration tests (real DB/Redis)
- `*.e2e.ts` — end-to-end Playwright specs

## Where tests live

- Unit and integration: co-located with source (`src/**/*.spec.ts`, `src/**/*.int.ts`)
- E2E: `tests/e2e/` at repo root
- Contract: `tests/contract/` at repo root
- Chaos: `tests/chaos/` at repo root
- Isolation matrix: `tests/isolation/` at repo root
- Load: `tools/load/` at repo root

## How to run each layer locally

| Command                       | What it runs                              |
| ----------------------------- | ----------------------------------------- |
| `pnpm test`                   | All unit + integration (Vitest workspace) |
| `pnpm test:e2e`               | Playwright E2E suite                      |
| `pnpm test:e2e --grep @smoke` | Smoke-tagged E2E only                     |
| `pnpm test:isolation`         | Cross-tenant isolation matrix             |
| `pnpm test:contract`          | OpenAPI contract tests                    |
| `pnpm test:chaos`             | Chaos-lite tests                          |
| `pnpm db:seed:realistic`      | Realistic seed                            |
| `pnpm load:verify`            | k6 verify load test                       |

`pnpm test:e2e` requires `docker compose -f docker/compose.yml up -d` already running.
Playwright's `globalSetup` (`tests/e2e/global-setup.ts`) waits for the api/web-verify/web-admin
health endpoints and then runs `pnpm db:seed:realistic -- --scale 0.1` automatically — you don't
need to run it by hand first, but the manifest it writes (`packages/db/prisma/seed/realistic/manifest.json`,
gitignored) is what `tests/e2e/fixtures/manifest.ts` and anything using `loginAs(page, role, tenantSlug)`
read from, so a stale or missing manifest is the first thing to check if a spec can't find seeded data.

`tests/isolation/**` and `tests/contracts/**` (`pnpm test:isolation`, `pnpm test:contract`) load
`.env`/`.env.example` via `tests/setup-env.ts` (a Vitest `setupFiles` entry) — without it they
fall back to schema default ports instead of this worktree's offset ones and fail with
`ECONNREFUSED`.

### Playwright projects and the shared per-IP rate limit

`playwright.config.ts` scopes `testMatch` per project (web-verify vs web-admin) — a spec for one
app must not also collect under the other app's project. Verify specs (`verify-*.spec.ts`,
`cookieless.spec.ts`) run under `web-verify-desktop`/`web-verify-mobile`; admin specs
(`analytics.spec.ts`, `compliance.spec.ts`, `oem-manifest.spec.ts`, `reports.spec.ts`,
`anomalies/*.spec.ts`) run under `web-admin-desktop`. New specs: add their pattern to the
matching list in `playwright.config.ts` (or drop admin specs under `tests/e2e/anomalies/`,
already matched by a glob).

The verify rate limit (`RATE_LIMIT_IP_PER_MIN` in `docker/compose.yml`, default 120) is
per-source-IP, and every browser-driven e2e spec shares one IP against the compose stack.
`tests/e2e/verify-rate-limited.spec.ts` deliberately exhausts that budget to prove the limiter
degrades cleanly (no crash, no false verdict) — it runs in its own `web-verify-rate-limit`
Playwright project, which declares `dependencies` on `web-verify-desktop` and
`web-verify-mobile` so it only starts after both finish. Do not add rate-limit-sensitive
assertions to specs that run in the regular verify projects; if a new spec needs to test what
happens when the limit trips, add it next to that file instead.

## Coverage thresholds

| Package                 | Lines | Branches |
| ----------------------- | ----- | -------- |
| `packages/core`         | 100%  | 100%     |
| `apps/api` (per module) | 85%   | 80%      |
| `apps/web-*`            | 70%   | —        |
| `packages/sdk`          | 90%   | —        |

Thresholds are enforced per-package in each `vitest.config.ts` — a drop fails CI.
