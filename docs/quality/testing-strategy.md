# Testing Strategy

## Test pyramid per package

| Package | Unit (`*.spec.ts`) | Integration (`*.int.ts`) | E2E (`*.e2e.ts`) |
|---|---|---|---|
| `packages/core` | 100% — pure functions, zero I/O | — | — |
| `packages/db` | factory/RNG logic | `createTestDatabase()` against real Postgres | — |
| `apps/api` | per-module service logic | against real Postgres + Redis | — |
| `apps/web-*` | component logic | — | Playwright journeys |
| `packages/sdk` | client methods | — | contract (Schemathesis) |

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

| Command | What it runs |
|---|---|
| `pnpm test` | All unit + integration (Vitest workspace) |
| `pnpm test:e2e` | Playwright E2E suite |
| `pnpm test:e2e --grep @smoke` | Smoke-tagged E2E only |
| `pnpm test:isolation` | Cross-tenant isolation matrix |
| `pnpm test:contract` | OpenAPI contract tests |
| `pnpm test:chaos` | Chaos-lite tests |
| `pnpm db:seed:realistic` | Realistic seed |
| `pnpm load:verify` | k6 verify load test |

## Coverage thresholds

| Package | Lines | Branches |
|---|---|---|
| `packages/core` | 100% | 100% |
| `apps/api` (per module) | 85% | 80% |
| `apps/web-*` | 70% | — |
| `packages/sdk` | 90% | — |

Thresholds are enforced per-package in each `vitest.config.ts` — a drop fails CI.