# E21 — Quality Engineering

| | |
|---|---|
| Wave | 1 → 3 (cross-cutting; starts with wave 1, owns the CI matrix to the end) |
| Status | todo |
| Owner | — |
| GitHub Issue | [#22](https://github.com/enendufrankc/verifynNG/issues/22) |
| Depends on | E00 (test tooling, `createTestDatabase()`, CI skeleton); consumes every feature epic as it lands |
| Unblocks | every epic's demo (realistic seed), E15/E16/E18/E20 acceptance flows, release gate |
| Readiness items | `production-readiness.md` §11 all rows (engine test suite is E01's; E21 owns isolation + lifecycle integration tests, load testing, chaos/failover drills) · §2 "cross-tenant isolation tests in CI" · §4 CI/CD gates · §4 backups + restore drills (runs E18's script nightly) |

## Goal

Every other epic proves itself against one shared, realistic, deterministic dataset; every tenant-scoped route is automatically proven isolated; the verify hot path is load-tested nightly against numbers written down here; the public API is held to its own spec; the two datastores can die mid-test without lying to consumers; and a PR cannot merge without the fast suite while a release cannot ship without the slow one. Without this epic each epic tests its own happy path with its own three rows and the first launch spike or the first cross-tenant leak is discovered by a customer.

## Scope

**In:** realistic seed (`pnpm db:seed:realistic`) with seeded RNG, Playwright suite structure + shared fixtures + cross-app journeys + visual baselines, route-discovering cross-tenant isolation matrix, OpenAPI contract tests, k6 load tests in compose with CI thresholds, chaos-lite container kills, Stryker mutation testing on `packages/core` + verdict engine, flaky-test quarantine policy and tooling, CI matrix (PR / nightly / release gate), test data privacy rules, per-package coverage thresholds, release gate checklist.

**Out:** unit tests for any epic's own logic (each epic writes its own — E21 sets thresholds and reviews), the E02 isolation harness primitives (`asTenant()`, `expectIsolated()` — E02 owns; E21 extends into the matrix), the E00 minimal seed (`ivoryglow` + 3 products stays E00's and remains the default `pnpm db:seed`), observability dashboards used during load (E17), backup/restore scripts (E18 — E21 schedules the drill), production infra/perf tuning (out of every epic's scope by README), security pen-testing (readiness §2 P1, external vendor).

## Owned paths

```
packages/db/prisma/seed/realistic/**        generators, distributions, anomaly planting, manifest of ids
packages/db/src/testing/**                  seeded RNG, factories, isolation-matrix runner
tests/e2e/**                                Playwright project: fixtures, journeys, visual baselines   (E11 keeps app-level component tests in apps/web-admin/tests)
tests/contract/**                           Schemathesis/Dredd config + custom checks against packages/sdk/openapi.json
tests/chaos/**                              chaos-lite scripts and assertions
tools/load/**                               k6 scripts, thresholds, compose runner
.github/workflows/{nightly.yml,release-gate.yml}   (E00 owns ci.yml; E21 adds jobs to it via one-line `uses:` includes agreed with E00)
stryker.config.mjs, vitest.workspace.ts coverage section
docs/quality/**                             testing strategy, flaky policy, release checklist, load baselines
```

## Interfaces

**Consumes:**
- E00: `createTestDatabase()`, Vitest workspace, Playwright config, `ci.yml` job names, compose service contract.
- E01: `generateCode`, `hashForStorage`, `StaticKeyRing`, fixture codes — the seed mints real codes so any seeded code verifies.
- E02: `asTenant(tenantId, role)` request helper, `expectIsolated()` assertion, seeded auth users; `@TenantId()` decorator metadata (the matrix reflects on it).
- E03: tenant statuses (seed includes one `suspended` tenant snapshot for guard tests).
- E04: `MintService` (seed uses it for correctness of watermarks and hashes rather than raw inserts, except for the 50k-unit bulk path which uses `MintService.mintBulk` — request to E04 for a `skipExports` option), `Batch`, `Unit`.
- E06: `ScanEvent` shape and verdict enum, `GET /v1/verify/:code`, `VerdictEngine` (mutation-tested here).
- E07: anomaly rule thresholds (the seed plants scenarios that must trigger each rule exactly once per tenant).
- E08: `Report`; E12: `UsageEvent`/`UsageSummary` (seed writes summaries for 6 past months); E15: `Plan`, `Subscription`, `Invoice` (seed creates paid/failed invoices); E16: `packages/sdk/openapi.json`, `ApiKey`; E18: `docker/scripts/{backup,restore}.sh`; E20: `fake-oidc` users; E17: readiness endpoints `/health/ready`, `/health/live` and Grafana dashboards for load runs.
- E11: `loginAs(role)` base fixture (E11 defines; E21 wraps and re-exports from `tests/e2e/fixtures`).
- E13: `@Audited` metadata (matrix asserts every mutating tenant route is audited — a second discovery check).

**Exposes:**
- `pnpm db:seed:realistic [--scale 0.1|1|10] [--seed 42]` — deterministic; writes `packages/db/prisma/seed/realistic/manifest.json` with well-known ids (tenants, one unit per scenario, api keys, users) that E2E and demos import.
- `@verifyng/db/testing`: `seededRng(seed)`, `factories` (`tenant()`, `user()`, `product()`, `batch()`, `unit()`, `scanEvent()`), `isolationMatrix({ app, seeds })`.
- `tests/e2e/fixtures`: `loginAs(role, tenant?)`, `loginViaSso()` (from E20), `mintBatch({ count })`, `scanCode(code, { ip?, ua? })`, `openConsole(path)`, `expectAudit(action)`, `mailpit.waitFor(subject)`, `webhookSink.waitFor(event)`, `payOnFakeCheckout()`.
- CI contracts: PR jobs `lint`, `typecheck`, `test:unit`, `test:integration`, `test:smoke`, `isolation-matrix`, `openapi-check`; nightly jobs `e2e-full`, `visual`, `load`, `chaos`, `mutation`, `restore-drill`; `release-gate` workflow producing a checklist artifact.
- Seed users (all passwords `Passw0rd!`, TOTP secret `JBSWY3DPEHPK3PXP` where enrolled): `owner@ivoryglow.com` (owner, TOTP), `ops@ivoryglow.com` (operator), `view@ivoryglow.com` (viewer), `owner@acme.test`, `owner@nkem.test`, `support@verifyng.local` (platform support, TOTP).
- Domain events: none.

## Data model

None owned. The realistic seed writes only to other epics' models through their services or factories; it adds no schema. It records what it wrote in `manifest.json` (not the DB).

Realistic dataset (scale 1):

| Entity | Count | Shape |
|---|---|---|
| Tenants | 3 | `ivoryglow` (NG, growth, active, SSO fake), `acme` (GB, starter, GBP, one failed invoice → `past_due`), `nkem-naturals` (NG, free-trial, 480/500 units used) |
| Users/Memberships | 9 + support | roles as above; one user in two tenants |
| Products | 20 | 8 / 7 / 5 with real GTIN check digits; IVORY GLOW's 3 real SKUs from `legacy/cli.js` |
| OEMs | 5 | NG, CN, GB |
| Batches | 60 | sizes log-normal (median 600, max 5,000), dates over 18 months, statuses minted/printed/shipped, 2 never-shipped (dead-code scenario) |
| Units | 50,000 | via `MintService`; ~4% flagged/decommissioned in `ivoryglow` |
| ScanEvents | 500,000 | 88% tier-1, 12% tier-2; time: diurnal curve on Africa/Lagos + Europe/London, weekly seasonality, one launch spike day (×12); geo: 70% NG (Lagos 45%, Abuja, Kano, Port Harcourt, Ibadan, Onitsha), 15% GB, 10% GH/KE/ZA, 5% other, with IPs drawn from documented test ranges per city (fake-geo maps them); UA mix 80% mobile; invalid-code probes 2% |
| Planted anomalies | 1 of each per tenant | geo dispersion (one tier-2 in Lagos, Accra, Nairobi in 6 days), velocity/enumeration (one IP, 900 probes in 10 min), mass duplication (one tier-2 scanned 60× across 5 cities), pre-reveal (tier-2 scanned 3 days before batch `shippedAt`), dead-code batch scans (12 scans on a never-shipped batch) — ids listed in `manifest.json` |
| Reports | 40 | statuses across the E08 machine, 5 linked to planted anomalies |
| Usage summaries | 3 × 6 months | consistent with the scan/unit counts above |
| Invoices/Payments | 18 | `ivoryglow` all paid, `acme` last one failed 2×, `nkem` none |
| Tickets | 15 | across channels/statuses |
| API keys / webhooks | 2 keys + 1 endpoint per paid tenant | endpoint → `webhook-sink` |

Privacy rule: every email is under `.test`, `.local` or `example.com`; names from a fixed synthetic list; IPs from TEST-NET-1/2/3 and documented ranges only; no real person, address or card appears. Enforced by `pnpm seed:lint` (regex scan of the seed output for real TLD emails, Nigerian phone patterns, PAN-like numbers).

## Tasks

- [ ] T1 Strategy doc `docs/quality/testing-strategy.md`: pyramid per package, what each layer may mock (nothing we own), naming (`*.spec.ts` unit, `*.int.ts` integration, `*.e2e.ts`), where tests live, how to run each locally; coverage thresholds table (`core` 100/100, `api` modules 85 lines / 80 branches, `web-*` 70 lines, `sdk` 90) wired into `vitest.workspace.ts` so a drop fails CI.
- [ ] T2 `@verifyng/db/testing`: `seededRng` (mulberry32 → deterministic), factories building valid objects through E01 for codes, `withTenant()` helper; adopt in E00's example integration test.
- [ ] T3 Realistic seed — structure: `packages/db/prisma/seed/realistic/index.ts` with `--scale`, `--seed`, stage ordering (tenants → users → catalog → batches/units → scans → anomalies → reports → usage → billing → support → api/webhooks), per-stage timing log, `manifest.json` writer, idempotent (drops and recreates the three tenants only); `pnpm db:seed:realistic`. Runs in < 3 minutes at scale 1 on a laptop (bulk `COPY` via `pg-copy-streams` for scans).
- [ ] T4 Realistic seed — distributions + anomaly planting per the table above; unit tests assert determinism (two runs, same seed → identical `manifest.json` and row counts) and that each planted scenario triggers exactly its E07 rule when `pnpm --filter api cli anomalies:run` executes.
- [ ] T5 `pnpm seed:lint` privacy scanner + `docs/quality/test-data-privacy.md`; CI job fails on any hit.
- [ ] T6 Playwright suite `tests/e2e`: project config (chromium mobile + desktop, `baseURL` per app, trace on retry, HTML report artifact), fixtures listed under Exposes, `global-setup` that runs the realistic seed at scale 0.1 and waits for compose health, tagging (`@smoke`, `@journey`, `@visual`), `pnpm test:e2e --grep @smoke` < 5 min.
- [ ] T7 Cross-app journeys (each one spec, using `manifest.json` ids): (a) mint → export manifest → scan tier-1 on web-verify → scan tier-2 first time → second scan from another city → anomaly appears in console → consumer files report → operator investigates → flags unit → webhook-sink receives `unit.flagged`; (b) trial cap → upgrade → fake-pay → mint succeeds; (c) support impersonation read → elevate → action → audit; (d) SSO JIT login → MFA grace banner; (e) restricted tenant: verify works, mint blocked.
- [ ] T8 Visual regression: `@visual` specs snapshot web-verify verdict states (authentic / already-verified / suspicious / flagged / decommissioned / unknown / invalid / rate-limited) and 6 key console pages at two viewports; baselines committed under `tests/e2e/__screenshots__`; `maxDiffPixelRatio 0.01`; update procedure documented.
- [ ] T9 Isolation matrix: `isolationMatrix()` boots the Nest app in-process, walks `DiscoveryService` for every controller route, classifies as tenant-scoped when the path contains `:tenantId` or the handler has `@TenantId()`/`@Roles()` metadata, and for each: (1) as tenant A read/write tenant B's ids → expect 403/404 never 200; (2) unauthenticated → 401; (3) mutating routes carry `@Audited` metadata; (4) any tenant-scoped route with no scoping metadata → **fail with the route name** ("new route lacks tenant scoping"). Allow-list file `tests/isolation/allowlist.json` for public routes (`/v1/verify/*`, `/v1/public/*`, `/api/docs`, health) requiring a justification string. Runs on PR.
- [ ] T10 Contract tests `tests/contract`: Schemathesis against `http://api:4000/api/v1` with `packages/sdk/openapi.json`, auth header from seeded key, stateful checks for cursor pagination, negative-testing of every enum; custom check that every 4xx body matches the E16 error envelope schema; run on PR when `apps/api/src/modules/public-api/**` or the spec changes, nightly always.
- [ ] T11 Load tests `tools/load`: `verify.js` (500 rps for 5 min, 90% tier-1 / 10% tier-2 from a 20k-code sample exported by the seed, 3% invalid, thresholds `http_req_duration{p(95)}<300ms`, `http_req_failed<0.1%`, `checks>99.9%`), `mint.js` (100k units across 20 batch requests, threshold total < 10 min and zero 5xx), `public-api.js` (mixed reads at plan rate-limit, asserts 429s are exactly the excess), `enumeration.js` (attack traffic; asserts E06 blocks within 30s and legitimate traffic p95 unaffected); compose profile `load` adds `k6` container with `--out json` → `tools/load/results/`; `pnpm load:verify` etc.; `docs/quality/load-baselines.md` records dated results + machine spec; nightly job fails on threshold breach.
- [ ] T12 Chaos-lite `tests/chaos`: while `verify.js` runs at 100 rps: `docker compose kill redis` → assert `/health/ready` flips to 503 within 5s, verify keeps returning verdicts (rate limiting degrades to fail-open with a logged warning per E06's decision) or returns a documented 503 with `Retry-After` — whichever E06/E17 specify; `docker compose start redis` → ready within 15s, BullMQ jobs resume (a webhook delivery queued during the outage lands). Same for `postgres`: verify returns 503 (never a false "unknown/counterfeit" verdict — this is the critical assertion), recovers, no duplicate scan events. Written as a Vitest suite shelling out to compose; nightly.
- [ ] T13 Mutation testing: `stryker.config.mjs` for `packages/core` (threshold: break < 95% mutation score) and `apps/api/src/modules/verification/verdict/**` (break < 85%); incremental mode cached in CI; nightly; report artifact; surviving mutants triaged into issues on E01/E06.
- [ ] T14 Flaky policy + tooling: `docs/quality/flaky-tests.md` (a test that fails then passes on retry is flaky; quarantine within 24h via `test.fixme` + issue with `flaky` label; owner has 7 days; quarantined tests run in a non-blocking nightly job and are listed in the release gate); Playwright `retries: 1` on CI only with a reporter that posts retried tests to the job summary; Vitest `retry: 0`.
- [ ] T15 CI matrix: extend E00 `ci.yml` (agreed one-line includes) with `isolation-matrix`, `openapi-check`, `seed-lint`, `test:smoke`; `nightly.yml` (02:00 UTC): full seed, `e2e-full`, `visual`, `contract`, `load`, `chaos`, `mutation`, `restore-drill` (E18 scripts), each uploading artifacts and posting a summary; concurrency and timeouts; runner sizing notes.
- [ ] T16 Release gate: `release-gate.yml` (manual dispatch with tag) runs the nightly set on the tag plus `pnpm audit --prod`, secret scan, `docker compose config`, license check, and renders `docs/quality/release-checklist.md` into a job summary with pass/fail per row (all nightly jobs green in last 24h, no open `flaky` older than 7 days, no P0/P1 issues open, coverage not decreased, load baselines within 10% of last release, restore drill < 15 min, changelog present, deprecations announced). Green gate produces a `release-<tag>.md` artifact.

## Acceptance criteria

- [ ] AC1 `docker compose up -d && pnpm db:seed:realistic --seed 42` finishes in < 3 min and prints the counts table (3 tenants, 20 products, 60 batches, 50,000 units, 500,000 scans, 15 anomalies, 40 reports, 18 invoices, 15 tickets); running it again with `--seed 42` yields a byte-identical `manifest.json`; `pnpm seed:lint` passes.
- [ ] AC2 Every planted anomaly fires: `pnpm --filter api cli anomalies:run --tenant ivoryglow` then `http://localhost:3001/anomalies` shows exactly 5 anomalies whose `unitId`/`batchId` match `manifest.json.anomalies.ivoryglow`; scanning `manifest.json.units.ivoryglow.massDuplicated` at `http://localhost:3000/v/<code>` shows the *suspicious* state with "verified 60 times in 5 regions".
- [ ] AC3 Isolation matrix: `pnpm test:isolation` passes on `main`; on a throwaway branch add `GET /v1/tenants/:tenantId/leak` returning `prisma.batch.findMany()` with no scoping → the job fails naming `TenantLeakController.leak` and the missing metadata; adding the route to `allowlist.json` without a justification string also fails.
- [ ] AC4 Journeys: `pnpm test:e2e --grep @journey` runs the five journeys green against compose in < 15 min; the HTML report artifact shows traces; journey (a) ends with `webhook-sink` at `http://localhost:4105` displaying `unit.flagged` for the unit from the run.
- [ ] AC5 Visual: `pnpm test:e2e --grep @visual` passes; changing the verdict badge colour in web-verify on a throwaway branch fails with a diff image attached to the report.
- [ ] AC6 Contract: `pnpm test:contract` (Schemathesis in compose) passes against `packages/sdk/openapi.json`; on a throwaway branch remove `nextCursor` from the batches list response → contract job fails citing the schema path.
- [ ] AC7 Load: `docker compose --profile load run k6 run /scripts/verify.js` completes 5 min at 500 rps with p95 < 300 ms and < 0.1% errors on the reference machine documented in `docs/quality/load-baselines.md`; `mint.js` mints 100,000 units in < 10 min with zero 5xx; both results appended to the baselines doc with date and commit.
- [ ] AC8 Chaos: `pnpm test:chaos` passes: during `kill postgres`, zero verify responses carry verdict `unknown`/`invalid` for known-good codes (all are 503 with `Retry-After`), `/health/ready` is 503 within 5 s, and after `start postgres` the ready probe is 200 within 15 s and `SELECT count(*) FROM "ScanEvent"` equals successful responses (no duplicates, no loss).
- [ ] AC9 Mutation: nightly `mutation` job reports `packages/core` ≥ 95% and verdict engine ≥ 85%; introducing an unkilled mutant (e.g. flipping `>` to `>=` in a threshold with no test) on a branch fails the job.
- [ ] AC10 CI matrix + gate: a PR runs only the fast set (< 12 min wall clock on GitHub-hosted runners); `nightly.yml` posts a summary with every job's status and artifact links; `release-gate.yml` on a tag renders the checklist and refuses (red job) when a `flaky`-labelled issue is older than 7 days.

## Testing

E21 is the testing epic; its own tests are:
- Unit: `seededRng` determinism and distribution sanity (chi-squared on the geo/time buckets within tolerance), factory validity through E01 `verifyChecksum`, privacy scanner regexes (positive/negative corpus), isolation-matrix classifier on a fixture Nest app with deliberately good/bad controllers.
- Integration: seed at scale 0.01 against a fresh `createTestDatabase()` asserting counts and referential integrity; matrix against the real app.
- Self-check: every fixture in `tests/e2e/fixtures` has a spec exercising it alone (`fixtures.spec.ts`) so fixture breakage is diagnosed before journeys fail.
- The nightly and release workflows are exercised with `act` in a PR job for syntax and `workflow_dispatch` on a fork branch before merge.

## Compose services added

| Service | Image | Host port | Notes |
|---|---|---|---|
| k6 | grafana/k6:0.54 | — | `profiles: [load]`; mounts `tools/load` at `/scripts`, results to `tools/load/results`; env `API_URL=http://api:4000`, `K6_OUT=json=/results/<script>-<ts>.json`; sends metrics to E17's Prometheus remote-write when present (`K6_PROMETHEUS_RW_SERVER_URL`) |

No ports exposed. E18's `postgres-restore` (profile `drill`) is started by the nightly `restore-drill` job.

## Notes and decisions

- **One dataset, everywhere.** Demos, E2E, load sampling and contract tests all read `manifest.json` from the same seed so a "works on my seed" gap cannot exist. E00's minimal seed remains the default for quick starts.
- **Determinism over realism where they conflict.** Distributions are realistic in aggregate but every draw comes from `seededRng`; `Date.now()` is never called in the seed (anchored to `SEED_NOW=2026-08-28T00:00:00Z`, overridable).
- **The matrix is a ratchet.** It fails on absence of scoping metadata, not just on observed leaks, so a route that happens to be safe today but unmarked still fails; the allow-list makes public routes explicit and reviewed.
- **Chaos asserts semantics, not uptime.** The one unacceptable outcome is telling a consumer a genuine product is unknown because Postgres blipped; a 503 is fine, a false verdict is a defect. E06/E17 decide the exact degraded behaviour; E21 enforces whatever they document.
- **Load numbers are baselines, not SLOs.** 500 rps / p95 300 ms is the compose-on-a-laptop bar that catches regressions; production SLOs are E17's and cloud-dependent.
- **Mutation testing is scoped** to the two places where a surviving mutant means a wrong verdict or a forgeable code; running it repo-wide would cost hours for little signal.
- **Flaky means quarantined, not retried forever.** Retries exist to gather evidence, and the release gate makes long-lived quarantine a blocker.
- **No real PII, ever, in fixtures** — including screenshots in visual baselines (they are generated from the synthetic seed only).
