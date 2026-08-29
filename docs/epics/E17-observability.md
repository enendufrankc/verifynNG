# E17 — Observability

|                 |                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 2                                                                                                                                                                                                                                                                                     |
| Status          | in-progress                                                                                                                                                                                                                                                                           |
| Owner           | frank.enendu                                                                                                                                                                                                                                                                          |
| GitHub Issue    | [#18](https://github.com/enendufrankc/verifynNG/issues/18)                                                                                                                                                                                                                            |
| Depends on      | E00 (compose, health module, request-id middleware), E14 (`NotificationService`, `MailerPort` for alert routing), E06 (verify endpoint to probe; verdict/rate-limit metrics), E02 (`@TenantId()`/user context for log enrichment — consumed via `AsyncLocalStorage`, soft dependency) |
| Unblocks        | E18 Support (log/trace lookup by requestId), E21 (perf gates read the same metrics), E15/E12 (per-tenant volume from metrics vs rollups reconciliation)                                                                                                                               |
| Readiness items | `production-readiness.md` §5 all rows: centralised logs with tenant context, error tracking, uptime monitoring + alerting, core metrics, SLOs + status page, tracing · §4 "blue/green" prerequisite (`/ready`) · `architecture.md` step 11                                            |

## Goal

When a consumer in Onitsha sees an error instead of a verdict, we know before they tell us. This epic instruments the API and both Next apps with OpenTelemetry, ships every log line with `tenantId`/`requestId`/`userId`, stands up a local Grafana/Loki/Tempo/Prometheus stack in compose with dashboards and alert rules that fire into E14 (Mailpit locally), adds an `ErrorTrackerPort`, splits `/health` from `/ready`, runs a synthetic probe against `/v1/verify` every 30 s, publishes a minimal `/status` page in web-verify, and writes the SLO and the "verify API is down" runbook. The product is trust; downtime reads as "counterfeit". Observability of the verify path is therefore product, not plumbing.

## Scope

**In:** OTel SDK bootstrap for api/web-verify/web-admin, pino structured logging with context propagation and redaction, otel-collector + Grafana + Loki + Tempo + Prometheus compose services with provisioned datasources/dashboards/alert rules, alert → E14 bridge, `ErrorTrackerPort` + adapters, `/health` vs `/ready`, `uptime-probe` container, `ProbeResult` storage and `GET /v1/status` public route, `/status` page in web-verify, SLO doc, incident runbook, k6 hooks for E21.

**Out (with owner):**

- The verify endpoint's own behaviour — E06. E17 measures it.
- Email/SMS delivery of alerts — E14. E17 only calls `NotificationService.send('ops.alert', …)` and asks E14 for that template.
- Audit log — E13 (tamper-evident business events ≠ operational logs).
- Cloud alerting destinations (PagerDuty/WhatsApp) — out of scope for compose; documented in the runbook as a follow-up.
- Analytics rollups and business KPIs — E12. Verdict distribution appears here only as an operational metric (counter by verdict), never as a per-tenant analytics product.
- Legal incident register / breach notification — E19. The E17 runbook links to it.

## Owned paths

```
apps/api/src/telemetry/**                   OTel bootstrap (must load before Nest), pino logger, context store, redaction
apps/api/src/modules/health/**              takes over E00's HealthModule: /health, /ready
apps/api/src/modules/status/**              ProbeResult ingest + GET /v1/status
apps/api/src/telemetry/error-tracker/**     ErrorTrackerPort + adapters
apps/web-verify/app/status/**               public status page (carve-out inside E09's app)
apps/web-verify/instrumentation.ts          Next OTel hook (one file; E09 agrees)
apps/web-admin/instrumentation.ts           same
packages/config/src/env.ts                  (section comment "E17")
packages/db/prisma/schema.prisma            (additive block: "E17")
tools/uptime-probe/**                       synthetic probe container
docker/observability/**                     otel-collector, prometheus, loki, tempo, grafana provisioning (dashboards + alert rules)
docker/compose.yml                          add the services listed below only
docs/slo.md
docs/runbooks/verify-api-down.md
```

## Interfaces

**Consumes**

- E00 request-id middleware (E17 replaces it with the `RequestContext` interceptor below and keeps the `x-request-id` header contract), `HealthModule` (superseded — coordinate the handover on E00's issue), compose port reservation 3100–3199.
- E14 `NotificationService.send({ template: 'ops.alert', to: OPS_ALERT_EMAILS, data: { alertName, severity, summary, runbookUrl, dashboardUrl, firingSince } })` — **change request on E14**: add the `ops.alert` template. Locally lands in Mailpit.
- E06 `GET /v1/verify/:code` (probe target) and E01 fixture code `fixtures.probe` — a dedicated tier-1 fixture whose scans E06 must **exclude from ScanEvent and E12 metering** when the request carries `x-synthetic-probe: <PROBE_KEY>` (**change request on E06**).
- E02 request user (`req.user.id`, `req.tenantId`) for log/trace enrichment when present.
- E21 k6 scripts read Prometheus metrics for pass/fail gates.

**Exposes**

Nest providers (`apps/api/src/telemetry/`):

- `RequestContext` — `AsyncLocalStorage<{ requestId, tenantId?, userId?, traceId, spanId }>` with `RequestContextInterceptor` (global) populating it from headers/auth; `getContext()` for any code path including BullMQ processors (`withJobContext(job, fn)` helper).
- `AppLogger` — pino instance; every line JSON with `{ level, time, msg, requestId, tenantId, userId, traceId, spanId, service, version }`; `redact` paths listed in Notes. Nest `LoggerService` adapter so framework logs share the format.
- `Metrics` — typed wrappers over OTel meters: `verifyLatency` (histogram, attrs `tier`, `verdict`, `tenantId`), `verifyVerdicts` (counter), `rateLimitHits` (counter, attrs `scope`), `httpServerDuration` (auto), `queueDepth`/`queueLag` (gauges per BullMQ queue, sampled every 15 s), `dbPoolInUse`, `probeSuccess` (gauge). Other epics record via `Metrics.*`; no direct OTel API usage outside this folder.
- `ErrorTrackerPort` — `captureException(err, ctx?)`, `captureMessage(msg, level, ctx?)`, `setUser/Tenant`; adapters `SentryErrorTracker` (DSN-driven) and `LogErrorTracker` (writes `level=error` structured events to Loki). Global Nest exception filter and Next `global-error.tsx`/`instrumentation.onRequestError` route through it.
- `@Traced(name?)` method decorator for explicit spans; Prisma, BullMQ, http, and `fetch` auto-instrumented.

HTTP routes:

- `GET /health` — liveness: process up, event loop responsive. Never touches DB. 200 `{ status: 'ok', uptimeSec }`.
- `GET /ready` — readiness: Postgres reachable **and** `prisma migrate status` reports no pending migrations, Redis reachable, MinIO bucket reachable, BullMQ workers registered. 200 `{ status:'ready', checks:{ db, migrations, redis, storage, workers } }` or 503 with the failing check named. Compose healthchecks switch to `/ready`.
- `GET /metrics` — Prometheus exposition (bound to the internal network only; not exposed via the public ingress in production docs).
- `POST /v1/status/probe` — internal, `x-synthetic-probe` key required, body `{ target, ok, latencyMs, statusCode, verdict?, at }` → stores `ProbeResult`.
- `GET /v1/status` — public, cached 30 s: `{ state: 'operational'|'degraded'|'outage', updatedAt, components: [{ name:'verify-api', state, p95Ms24h, uptime30dPct }], incidents: [] }`. Also serves `GET /v1/status/history?days=30` (daily uptime %).

Domain events:

- `ops.alert.fired { alertName, severity: 'page'|'ticket', summary, labels, firingSince }` and `ops.alert.resolved { alertName, resolvedAt }` — emitted by the alert bridge when Alertmanager webhooks arrive; E14 subscriber sends the mail; E18 may surface them.
- `probe.failed { target, statusCode, latencyMs, at }` — emitted on each failed probe (after 2 consecutive failures) so E18/E19 incident register can be opened.

Prisma models: below.

## Data model

```prisma
// ─── E17 Observability ──────────────────────────────────────────────────────
model ProbeResult {              // one row per synthetic probe run; not tenant-owned (platform-level)
  id          String   @id @default(cuid())
  target      String                                  // 'verify-api' | 'web-verify' | 'web-admin'
  ok          Boolean
  statusCode  Int?
  latencyMs   Int
  verdict     String?                                 // expected 'ok' for the tier-1 probe fixture
  region      String   @default("local")
  at          DateTime
  @@index([target, at])
}

model StatusDaily {              // rolled from ProbeResult nightly; feeds /status history and the 30-day uptime figure
  id          String   @id @default(cuid())
  target      String
  date        DateTime @db.Date
  checks      Int
  failures    Int
  p95Ms       Int
  @@unique([target, date])
}
```

`ProbeResult` retention: 90 days raw (E19 policy); `StatusDaily` indefinite. No tenant data, no PII.

## Tasks

- [x] T1 `apps/api/src/telemetry/otel.ts`: NodeSDK bootstrap loaded via `node --require` before Nest (auto-instrumentations: http, express/nest, pg/prisma, ioredis, bullmq, undici); OTLP/gRPC exporter to `otel-collector:4317`; resource attrs `service.name=api`, `service.version` from package.json, `deployment.environment`; `OTEL_*` env in `packages/config` section E17 with compose defaults; sampling 100% locally, `parentbased_traceidratio` configurable.
- [ ] T2 `RequestContext` + interceptor + `AppLogger` (pino, `pino-opentelemetry-transport` or Loki push via collector), Nest `LoggerService` adapter, `withJobContext` for BullMQ processors, redaction (`req.headers.authorization`, `*.password`, `*.token`, `*.secret`, `*.code` (full codes — log only `redactCode`), `*.email` → hashed, `ip` → hashed via the same salt E06 uses). Replaces E00 request-id middleware while keeping `x-request-id` echo.
- [ ] T3 `Metrics` wrappers and instrumentation points: middleware on `/v1/verify/*` for `verifyLatency`/`verifyVerdicts` (reads verdict from response body shape), `rateLimitHits` hook exposed for E06's limiter (**E06 calls `Metrics.rateLimitHits.add()`** — one-line change request), BullMQ queue depth/lag sampler, Prisma pool gauge; `/metrics` endpoint via Prometheus exporter on the internal port.
- [ ] T4 `ErrorTrackerPort` with `LogErrorTracker` (default in compose) and `SentryErrorTracker` (`@sentry/node`, `@sentry/nextjs`, enabled when `SENTRY_DSN` set); global exception filter; Next `instrumentation.ts` in both apps wiring `onRequestError` + `global-error.tsx` capture; client-side beacon for unhandled errors in web-verify (no PII, no code).
- [ ] T5 Health split: `GET /health` liveness, `GET /ready` readiness with the five checks including `migrations` (Prisma `_prisma_migrations` vs bundled migrations list); compose `api` healthcheck → `/ready`; Dockerfile `HEALTHCHECK` updated; both Next apps get `/api/ready` that checks the API's `/ready` and their own build id.
- [ ] T6 Compose observability stack under `docker/observability/`: `otel-collector` (receives OTLP, exports traces → Tempo, metrics → Prometheus remote-write, logs → Loki), `prometheus` (scrapes `api:9464/metrics`, `otel-collector`, `uptime-probe`), `loki`, `tempo`, `grafana` (provisioned datasources Loki/Tempo/Prometheus with trace↔log correlation on `traceId`). All on ports 3100–3199, behind a `observability` compose profile that is **on by default** in `compose.yml` (`COMPOSE_PROFILES=default,observability` in `.env.example`) so `docker compose up` includes it, and can be dropped on low-RAM machines.
- [ ] T7 Grafana dashboards (JSON, provisioned): **Verify Path** (p50/p95/p99 latency by tier, RPS, error rate 5xx %, verdict distribution stacked, rate-limit hits, top tenants by volume), **Platform** (Node event-loop lag, heap, DB pool, Redis, BullMQ depth/lag per queue, Next apps SSR duration), **Synthetic** (probe success, latency, 30-day uptime), **Logs Explorer** with tenantId/requestId variables.
- [ ] T8 Alert rules (Grafana unified alerting, provisioned): `VerifyErrorRateHigh` (5xx > 1% over 5 m, severity page), `VerifyLatencyP95High` (p95 > 500 ms over 10 m, ticket), `QueueLagHigh` (oldest waiting job > 60 s over 5 m, ticket), `ProbeFailing` (2 consecutive probe failures, page), `ReadinessFailing` (api `/ready` != 200 for 1 m, page). Contact point = webhook to `api` `POST /internal/alerts` (shared secret) → alert bridge emits `ops.alert.fired/resolved` → E14 sends `ops.alert` mail → Mailpit.
- [ ] T9 `tools/uptime-probe/`: tiny Node container, every 30 s (env `PROBE_INTERVAL_MS`) requests `GET api/v1/verify/<PROBE_FIXTURE_CODE>` with `x-synthetic-probe`, asserts 200 + `verdict: 'ok'` + latency; also `GET web-verify/` and `GET web-admin/api/ready`; posts each result to `POST /v1/status/probe`; exposes `/metrics` (`probe_success`, `probe_latency_ms`) for Prometheus; `/health`.
- [ ] T10 `StatusModule`: probe ingest, `StatusDaily` nightly roll (BullMQ repeatable), `GET /v1/status` + `/history` with state derivation (operational: last 5 probes ok; degraded: p95 24h > 300 ms or 1–2 failures in last 10; outage: ≥ 3 of last 5 failed), `probe.failed` event.
- [ ] T11 `apps/web-verify/app/status/page.tsx`: server-rendered, `revalidate = 30`, reads `GET /v1/status`, shows overall state pill, per-component rows, 30-day uptime bar (one cell per day from `/history`), "last checked" time, no tenant theming (platform-branded, uses E11 neutral tokens), link back to `/`. Accessible, no JS required.
- [ ] T12 `docs/slo.md`: SLIs (availability = successful probes ÷ total; latency = server-side p95 of `/v1/verify/*` from `verifyLatency`), SLOs (availability 99.9 %/30 d ≈ 43 min budget; verify p95 < 300 ms), error-budget policy (freeze non-verify deploys when < 25 % budget remains), how the alerts map to burn rates, what is measured locally vs production.
- [ ] T13 `docs/runbooks/verify-api-down.md`: detection (which alert, what the status page shows), first 5 minutes (check `/ready` → which check failed; Grafana links; `docker compose logs api`), likely causes and fixes (migration pending, DB pool exhausted, Redis down, bad deploy → roll back image tag), communication (status page state, E14 tenant notice template TBD with E14, E19 incident register entry if data exposure suspected), post-incident review template. Include a **rehearsal script**: `docker compose stop postgres` and walk the runbook; expected alert mail in Mailpit within 2 minutes.
- [ ] T14 CI: `compose-config` job validates the observability profile; smoke test that `/metrics` contains `verify_latency_ms_bucket` after one verify call; Playwright for `/status`.

## Acceptance criteria

- [ ] AC1 `docker compose up -d && docker compose ps` shows `otel-collector`, `prometheus`, `loki`, `tempo`, `grafana`, `uptime-probe` healthy alongside E00's services; `http://localhost:3100` (Grafana, anonymous viewer enabled locally) lists datasources Prometheus, Loki, Tempo and the four provisioned dashboards.
- [ ] AC2 `curl -s localhost:4000/v1/verify/<fixtures.tier1Ok>` then in Grafana **Verify Path** the RPS and p95 panels show the request within 30 s; `curl localhost:3103/api/v1/query?query=verify_latency_ms_count` (Prometheus) returns a non-zero series with labels `tier="1"`, `verdict="ok"`.
- [ ] AC3 `docker compose logs api --tail 5 | jq .` → every line is JSON containing `requestId`, `service`, `traceId`; lines produced during an authenticated web-admin request also contain `tenantId` and `userId`; `docker compose logs api | grep -c "ivoryglow.2.k1.[A-Z0-9]\{20\}"` → `0` (full codes never logged) and no `authorization` header values appear.
- [ ] AC4 In Grafana Explore (Loki) query `{service="api"} |= "<requestId from AC3>"` → the log lines; click the `traceId` → Tempo opens the trace showing spans `HTTP GET /v1/verify/:code` → `prisma:query` → `ioredis`. From web-verify: load `/v/<code>` and the trace includes a `web-verify` server span parented above the api span (context propagated via `traceparent`).
- [ ] AC5 `curl -i localhost:4000/health` → 200 even while `docker compose stop postgres`; `curl -i localhost:4000/ready` → 503 `{ checks: { db: 'down', … } }` during the stop, 200 after `start`; with a migration file added but not applied, `/ready` → 503 `migrations: 'pending'`.
- [ ] AC6 `docker compose stop api` → within 2 minutes `http://localhost:8025` (Mailpit) receives an `ops.alert` mail for `ProbeFailing` (and `ReadinessFailing`) with runbook and dashboard links; `http://localhost:3000/status` shows "Outage — Verify API"; `docker compose start api` → resolved mail arrives and `/status` returns to "Operational" within 2 minutes; `GET /v1/status/history` shows today's failures count > 0.
- [ ] AC7 `k6 run tools/load/verify-smoke.js` (E21 script, or `hey -z 60s -q 50 localhost:4000/v1/verify/<code>`) at a rate that crosses 500 ms p95 (throttle api with `docker compose exec api tc …` or set `VERIFY_ARTIFICIAL_DELAY_MS=600` test env) → `VerifyLatencyP95High` fires in Grafana and mails Mailpit; unset → resolves.
- [ ] AC8 Throw a deliberate error via `curl -H 'x-debug-throw: 1' localhost:4000/v1/verify/<code>` (dev-only header, disabled when `NODE_ENV=production`) → `LogErrorTracker` writes a `level=error` event visible in Loki with stack and `requestId`; with `SENTRY_DSN` set to a local `sentry-fake` URL (E21 mock) the `SentryErrorTracker` posts an envelope instead — proven by a unit test, not a compose service.
- [ ] AC9 `select count(*) from "ProbeResult" where "at" > now() - interval '5 minutes'` ≥ 8 (30 s cadence × 3 targets, minus start-up), and `select count(*) from "ScanEvent" where "createdAt" > now() - interval '5 minutes'` is unaffected by probes (E06 exclusion honoured).

## Testing

- **Unit:** redaction rules over a fixture log object (codes, tokens, emails, IPs), `RequestContext` propagation across `await`, `setTimeout`, and a BullMQ processor (`withJobContext`); status state derivation table (operational/degraded/outage); alert-webhook → event mapping; `ErrorTrackerPort` adapters (Sentry adapter against an in-process fake transport).
- **Integration (real Postgres/Redis):** `/ready` transitions for each failing dependency using `createTestDatabase()` and a stopped Redis client; `migrations: pending` detection with an unapplied migration; `ProbeResult` ingest → `StatusDaily` roll.
- **E2E (Playwright):** `/status` page renders each state (seeded `ProbeResult` rows) with axe assertions; web-verify error page routes an error through the tracker (asserted via Loki query in CI).
- **Compose smoke (CI):** `docker compose --profile observability config`, then start stack, hit verify once, assert `/metrics` and a Loki query return data; assert one `ops.alert` mail in Mailpit after stopping `api` (extended CI job, nightly rather than per-PR).

## Compose services added

| Service        | Image                                | Host port                         | Notes                                                                 |
| -------------- | ------------------------------------ | --------------------------------- | --------------------------------------------------------------------- |
| grafana        | grafana/grafana:11                   | 3100                              | anonymous viewer locally; provisioned dashboards/alerts/contact point |
| loki           | grafana/loki:3                       | 3101                              | filesystem storage, 7-day local retention                             |
| tempo          | grafana/tempo:2                      | 3102 (HTTP), 4317 internal only   |                                                                       |
| prometheus     | prom/prometheus:v2                   | 3103                              | scrapes api:9464, otel-collector:8889, uptime-probe:9465              |
| otel-collector | otel/opentelemetry-collector-contrib | 3104 (health), 4317/4318 internal | OTLP in; fan-out to tempo/prom/loki                                   |
| uptime-probe   | tools/uptime-probe                   | 3105 (/health, /metrics)          | 30 s cadence                                                          |

`api` additionally exposes `9464` (Prometheus) on the compose network only. All within the 3100–3199 block E00 reserved. Total added RAM ≈ 1 GB; documented opt-out via `COMPOSE_PROFILES=default`.

## Notes and decisions

- **Error tracking: `ErrorTrackerPort` with `LogErrorTracker` as the compose default, `SentryErrorTracker` as the production adapter. No GlitchTip container.** Rationale: GlitchTip adds Postgres + Redis + web + worker (~1.5 GB) to a stack that already has Loki; locally, Loki _is_ an adequate error store with `requestId`/`traceId` correlation, and Grafana can alert on `level=error` rate. In production Sentry's free tier (readiness §5) is the target and the adapter is exercised by unit tests against a fake transport. If the team later wants self-hosted parity, GlitchTip drops in behind the same port.
- **Prometheus is kept** (rather than Grafana Mimir or collector-only) because alert rules on histograms are simplest there and E21's k6 gates read it directly.
- **`/health` never touches dependencies**; `/ready` does. Orchestrators restart on liveness and drain on readiness — conflating them turns a DB blip into a restart storm. `migrations` in readiness is what makes a zero-downtime deploy safe: a new image with an unapplied migration never receives traffic.
- **Probes are excluded from business data.** `x-synthetic-probe` is a shared secret; E06 skips ScanEvent and `scan.recorded` for it, so E12 never meters and the tenant never sees probe traffic.
- **Logs carry hashed IP and hashed email, never raw**, matching E06's storage and E19's data map. Full codes are never logged — only `redactCode()` output. This is enforced by the redaction unit test plus AC3.
- **Status page is deliberately minimal and platform-branded**, not tenant-themed: it speaks for the platform's honesty, which is the whole pitch. Incident narrative entries are a later addition once E18/E19's incident register exists (`incidents: []` reserved in the payload).
- Change requests raised: E14 — `ops.alert` template; E06 — honour `x-synthetic-probe` (skip ScanEvent/events) and call `Metrics.rateLimitHits.add()`; E00 — hand over `HealthModule` and request-id middleware to E17; E09 — accept `instrumentation.ts` and `app/status/**` inside `apps/web-verify`; E11 — accept `instrumentation.ts` in `apps/web-admin`.
