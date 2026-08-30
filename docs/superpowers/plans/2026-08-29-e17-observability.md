# E17 Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full observability stack: OTel instrumentation, structured logging with context propagation, Grafana/Loki/Tempo/Prometheus compose services, health/ready split, synthetic uptime probe, public status page, SLO doc, incident runbook.

**Architecture:** E17 adds OpenTelemetry SDK bootstrap loaded before NestJS, pino structured logging with AsyncLocalStorage-based context propagation, Prometheus metrics exposition, and a compose-hosted Grafana/Loki/Tempo/Prometheus stack. The health module is split into liveness (/health) and readiness (/ready). A synthetic uptime-probe container polls services every 30s and posts results. A StatusModule derives operational state from probe data and serves a public API + status page.

**Tech Stack:** @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations, pino, @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-prometheus, @prisma/client, BullMQ, Grafana 11, Loki 3, Tempo 2, Prometheus v2, otel-collector-contrib

---

## Upstream Dependencies (stubbed)

E06 (verify endpoint), E14 (NotificationService), E02 (auth context) are not yet shipped. E17 stubs behind published interfaces:
- Verify endpoint: a minimal stub `GET /v1/verify/:code` that returns `{ verdict: 'ok', tier: 1 }` for a known fixture code
- NotificationService: a stub that logs alert dispatch (no real email until E14 ships)
- Auth context: `RequestContextInterceptor` reads `x-request-id`, `x-tenant-id`, `x-user-id` headers for enrichment when present; real JWT parsing waits for E02

## Execution Order

Phase 1 (foundation): T1 → T2 → T3 → T4 → T5
Phase 2 (compose stack): T6 → T7 → T8
Phase 3 (probe + status): T9 → T10 → T11
Phase 4 (docs + CI): T12 → T13 → T14

---

## Phase 1: Foundation

### Task 1: OTel SDK Bootstrap (T1)

**Files:**
- Create: `apps/api/src/telemetry/otel.ts`
- Create: `apps/api/src/telemetry/index.ts`
- Modify: `packages/config/src/env-schema.ts` (add E17 section)
- Modify: `apps/api/package.json` (add OTel deps)
- Modify: `apps/api/src/main.ts` (import otel before Nest)
- Modify: `.env.example` (add E17 vars with compose defaults)

- [ ] **Step 1: Add OTel dependencies**

```bash
cd apps/api && pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/exporter-metrics-otlp-grpc @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/sdk-metrics
```

- [ ] **Step 2: Add E17 env vars to config**

Add to `packages/config/src/env-schema.ts` after E00 section:

```typescript
// ── E17 Observability ───────────────────────────────────────────
const e17Schema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4317'),
  OTEL_TRACES_SAMPLER: z.string().default('always_on'),
  OTEL_TRACES_SAMPLER_ARG: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('api'),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.string().default('grpc'),
  PROBE_KEY: z.string().default('probe-secret-local'),
  PROBE_FIXTURE_CODE: z.string().default('PROBE_TIER1_OK'),
  SENTRY_DSN: z.string().optional(),
  OPS_ALERT_EMAILS: z.string().default('ops@verifynng.local'),
  ALERT_WEBHOOK_SECRET: z.string().default('alert-webhook-secret-local'),
  GRAFANA_PORT: z.coerce.number().default(3100),
  LOKI_PORT: z.coerce.number().default(3101),
  TEMPO_PORT: z.coerce.number().default(3102),
  PROMETHEUS_PORT: z.coerce.number().default(3103),
  OTEL_COLLECTOR_PORT: z.coerce.number().default(3104),
  UPTIME_PROBE_PORT: z.coerce.number().default(3105),
  METRICS_PORT: z.coerce.number().default(9464),
  VERIFY_ARTIFICIAL_DELAY_MS: z.coerce.number().default(0),
});
```

Merge into the exported schema: `export const envSchema = e00Schema.merge(e17Schema);`

- [ ] **Step 3: Create OTel bootstrap file**

Create `apps/api/src/telemetry/otel.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { readFileSync } from 'fs';
import { join } from 'path';

let sdk: NodeSDK | undefined;

export function startOtel(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';
  const serviceName = process.env.OTEL_SERVICE_NAME || 'api';

  let version = '0.0.0';
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
    );
    version = pkg.version || '0.0.0';
  } catch {
    // fallback
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: version,
      'deployment.environment': process.env.NODE_ENV || 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', async () => {
    await sdk?.shutdown();
  });
}
```

Create `apps/api/src/telemetry/index.ts`:

```typescript
export { startOtel } from './otel.js';
```

- [ ] **Step 4: Update main.ts to bootstrap OTel before Nest**

Modify `apps/api/src/main.ts` — add `startOtel()` call before NestFactory:

```typescript
import 'reflect-metadata';
import { startOtel } from './telemetry/otel';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from '@verifynng/config';

// Bootstrap OTel before Nest — must be first
startOtel();

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(env.API_PORT);
  console.log(`API running on http://localhost:${env.API_PORT}`);
}

bootstrap();
```

- [ ] **Step 5: Update .env.example with E17 vars**

Add after E00 section:

```
# ── E17 Observability ───────────────────────────────────────
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_TRACES_SAMPLER=always_on
OTEL_SERVICE_NAME=api
PROBE_KEY=probe-secret-local
PROBE_FIXTURE_CODE=PROBE_TIER1_OK
SENTRY_DSN=
OPS_ALERT_EMAILS=ops@verifynng.local
ALERT_WEBHOOK_SECRET=alert-webhook-secret-local
GRAFANA_PORT=3100
LOKI_PORT=3101
TEMPO_PORT=3102
PROMETHEUS_PORT=3103
OTEL_COLLECTOR_PORT=3104
UPTIME_PROBE_PORT=3105
METRICS_PORT=9464
VERIFY_ARTIFICIAL_DELAY_MS=0
```

- [ ] **Step 6: Run lint + typecheck to verify**

```bash
pnpm lint && pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(E17): OTel SDK bootstrap and env config"
```

---

### Task 2: RequestContext + AppLogger + Redaction (T2)

**Files:**
- Create: `apps/api/src/telemetry/context.ts`
- Create: `apps/api/src/telemetry/logger.ts`
- Create: `apps/api/src/telemetry/redaction.ts`
- Create: `apps/api/src/telemetry/request-context.interceptor.ts`
- Modify: `apps/api/src/app.module.ts` (replace RequestIdMiddleware with global interceptor, provide AppLogger)
- Delete: `apps/api/src/common/request-id.middleware.ts` (E17 supersedes E00's middleware)
- Create: `apps/api/src/telemetry/context.spec.ts`
- Create: `apps/api/src/telemetry/redaction.spec.ts`

- [ ] **Step 1: Add pino dependency**

```bash
cd apps/api && pnpm add pino pino-pretty
```

- [ ] **Step 2: Write redaction tests first**

Create `apps/api/src/telemetry/redaction.spec.ts` — test that:
- Full tier-1 codes like `ivoryglow.2.k1.ABCDEFGH1234567890AB` are replaced with `ivoryglow.2.k1.AB…AB`
- `authorization` header values are replaced with `[REDACTED]`
- `password`, `token`, `secret` fields are replaced
- Email values are hashed (deterministic, not raw)
- IP values are hashed (deterministic, not raw)

- [ ] **Step 3: Implement redaction**

Create `apps/api/src/telemetry/redaction.ts`:
- `redactCode(code: string): string` — keeps first 2 and last 2 chars of the code segment
- `redactLogObject(obj: Record<string, unknown>): Record<string, unknown>` — walks the object applying rules
- pino `redact` paths for authorization, password, token, secret
- Hashing helpers for email and IP using crypto HMAC with a configurable salt

- [ ] **Step 4: Write RequestContext tests**

Create `apps/api/src/telemetry/context.spec.ts` — test that:
- `getContext()` returns undefined when no store is active
- `runWithContext(ctx, fn)` makes `getContext()` return ctx inside fn
- Context propagates across `await`
- Context propagates across `setTimeout`
- `withJobContext(job, fn)` extracts requestId/tenantId from BullMQ job payload

- [ ] **Step 5: Implement RequestContext**

Create `apps/api/src/telemetry/context.ts`:
- `AsyncLocalStorage<RequestContext>` 
- `RequestContext` type: `{ requestId: string; tenantId?: string; userId?: string; traceId?: string; spanId?: string }`
- `getContext(): RequestContext | undefined`
- `runWithContext(ctx, fn): T`
- `withJobContext(job, fn): T` for BullMQ

- [ ] **Step 6: Implement RequestContextInterceptor**

Create `apps/api/src/telemetry/request-context.interceptor.ts`:
- Global Nest interceptor
- Reads `x-request-id` from request (or generates UUID)
- Reads `x-tenant-id`, `x-user-id` from headers (stub until E02 ships real auth)
- Gets `traceId`/`spanId` from active OTel span
- Runs the handler inside `runWithContext()`
- Echoes `x-request-id` on response

- [ ] **Step 7: Implement AppLogger**

Create `apps/api/src/telemetry/logger.ts`:
- Creates pino instance with JSON transport
- Mixes in `requestId`, `tenantId`, `userId`, `traceId`, `spanId`, `service`, `version` from `getContext()`
- Implements Nest `LoggerService` interface
- Uses pino redact paths for authorization, password, token, secret
- Exports `AppLogger` class and `APP_LOGGER` injection token

- [ ] **Step 8: Update telemetry/index.ts exports**

- [ ] **Step 9: Update AppModule**
- Remove `RequestIdMiddleware` from `configure()`
- Import `TelemetryModule` (new module that provides RequestContextInterceptor, AppLogger)
- Use `app.useLogger(app.get(AppLogger))` in main.ts

- [ ] **Step 10: Remove old RequestIdMiddleware**

Delete `apps/api/src/common/request-id.middleware.ts`

- [ ] **Step 11: Run lint + typecheck + test**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat(E17): RequestContext, AppLogger, redaction — replaces E00 request-id middleware"
```

---

### Task 3: Metrics Wrappers (T3)

**Files:**
- Create: `apps/api/src/telemetry/metrics.ts`
- Create: `apps/api/src/telemetry/metrics.module.ts`
- Create: `apps/api/src/telemetry/verify-metrics.middleware.ts`
- Create: `apps/api/src/telemetry/metrics.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import MetricsModule, apply verify middleware)

- [ ] **Step 1: Add Prometheus exporter dependency**

```bash
cd apps/api && pnpm add @opentelemetry/exporter-prometheus
```

- [ ] **Step 2: Write metrics tests**

Create `apps/api/src/telemetry/metrics.spec.ts`:
- Test that `Metrics.verifyLatency.record()` creates a histogram data point with correct attributes
- Test that `Metrics.verifyVerdicts.add()` increments counter with tier/verdict/tenantId labels
- Test that `Metrics.rateLimitHits.add()` increments with scope label
- Test that `Metrics.probeSuccess.set()` updates the gauge

- [ ] **Step 3: Implement Metrics class**

Create `apps/api/src/telemetry/metrics.ts`:
- Get OTel meter from `@opentelemetry/api` meter provider
- Create meters: `verifyLatency` (histogram ms), `verifyVerdicts` (counter), `rateLimitHits` (counter), `httpServerDuration` (auto from OTel), `queueDepth`/`queueLag` (observable gauges), `dbPoolInUse` (observable gauge), `probeSuccess` (gauge)
- Export typed `Metrics` object with methods for each metric

- [ ] **Step 4: Create MetricsModule**

Create `apps/api/src/telemetry/metrics.module.ts`:
- Provides `Metrics` as a singleton
- Starts Prometheus exporter on `METRICS_PORT` (9464 internal)

- [ ] **Step 5: Create verify metrics middleware**

Create `apps/api/src/telemetry/verify-metrics.middleware.ts`:
- Applied to routes matching `/v1/verify/*`
- Records `verifyLatency` with timer
- Reads verdict from response body and records `verifyVerdicts`

- [ ] **Step 6: Wire into AppModule**

- Import `MetricsModule`
- Apply `VerifyMetricsMiddleware` to `/v1/verify/*` routes

- [ ] **Step 7: Add `/metrics` endpoint**

The Prometheus exporter already serves on port 9464. Ensure it's accessible on the compose network.

- [ ] **Step 8: Run lint + typecheck + test**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(E17): Metrics wrappers and verify latency middleware"
```

---

### Task 4: ErrorTrackerPort + Adapters (T4)

**Files:**
- Create: `apps/api/src/telemetry/error-tracker/error-tracker.port.ts`
- Create: `apps/api/src/telemetry/error-tracker/log-error-tracker.ts`
- Create: `apps/api/src/telemetry/error-tracker/sentry-error-tracker.ts`
- Create: `apps/api/src/telemetry/error-tracker/global-exception-filter.ts`
- Create: `apps/api/src/telemetry/error-tracker/error-tracker.module.ts`
- Create: `apps/api/src/telemetry/error-tracker/log-error-tracker.spec.ts`
- Create: `apps/api/src/telemetry/error-tracker/sentry-error-tracker.spec.ts`
- Create: `apps/web-verify/instrumentation.ts`
- Create: `apps/web-admin/instrumentation.ts`

- [ ] **Step 1: Define ErrorTrackerPort**

Create `apps/api/src/telemetry/error-tracker/error-tracker.port.ts`:
- Interface: `captureException(err, ctx?)`, `captureMessage(msg, level, ctx?)`, `setUser(id)`, `setTenant(id)`
- `ERROR_TRACKER` injection token

- [ ] **Step 2: Write LogErrorTracker tests**

Test that `captureException` writes a structured `level=error` event via AppLogger with stack trace and context.

- [ ] **Step 3: Implement LogErrorTracker**

Uses `AppLogger` to write error events with full context from RequestContext.

- [ ] **Step 4: Write SentryErrorTracker tests**

Test against an in-process fake HTTP server that captures Sentry envelopes. Verify the envelope contains the exception data.

- [ ] **Step 5: Implement SentryErrorTracker**

Uses `@sentry/node` when `SENTRY_DSN` is set. Needs `@sentry/node` as optional dependency.

- [ ] **Step 6: Create global exception filter**

`GlobalExceptionFilter` — catches all Nest exceptions, calls `ErrorTrackerPort.captureException()`, then re-throws.

- [ ] **Step 7: Create ErrorTrackerModule**

Provides `LogErrorTracker` by default, `SentryErrorTracker` when `SENTRY_DSN` is set. Registers global exception filter.

- [ ] **Step 8: Create Next.js instrumentation files**

`apps/web-verify/instrumentation.ts` and `apps/web-admin/instrumentation.ts`:
- Export `async function register()` that initializes Sentry if `SENTRY_DSN` is set
- Next.js calls this automatically on startup

- [ ] **Step 9: Wire into AppModule**

Import `ErrorTrackerModule`.

- [ ] **Step 10: Run lint + typecheck + test**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(E17): ErrorTrackerPort with Log and Sentry adapters, global exception filter"
```

---

### Task 5: Health Split — /health vs /ready (T5)

**Files:**
- Move: `apps/api/src/health/**` → `apps/api/src/modules/health/**`
- Create: `apps/api/src/modules/health/health.controller.ts` (rewrite with /health and /ready)
- Create: `apps/api/src/modules/health/health.service.ts` (rewrite with liveness + readiness)
- Create: `apps/api/src/modules/health/health.module.ts`
- Create: `apps/api/src/modules/health/migrations.health.ts`
- Create: `apps/api/src/modules/health/storage.health.ts`
- Create: `apps/api/src/modules/health/workers.health.ts`
- Modify: `apps/api/src/app.module.ts` (update health import path)
- Modify: `docker/compose.yml` (update api healthcheck to /ready)
- Modify: `docker/Dockerfile.api` (add HEALTHCHECK)
- Create: `apps/web-verify/app/api/ready/route.ts`
- Create: `apps/web-admin/app/api/ready/route.ts`

- [ ] **Step 1: Create modules/health directory and move files**

Move `apps/api/src/health/` to `apps/api/src/modules/health/`. The epic owns `apps/api/src/modules/health/**`.

- [ ] **Step 2: Rewrite HealthController**

Two endpoints:
- `GET /health` → liveness: `{ status: 'ok', uptimeSec }`. Never touches DB. 200 always if process is up.
- `GET /ready` → readiness: checks db, migrations, redis, storage, workers. Returns 200 with all check results or 503 with failing check.

- [ ] **Step 3: Rewrite HealthService**

Split into:
- `isAlive()`: returns `{ status: 'ok', uptimeSec: process.uptime() }`
- `isReady()`: runs all 5 checks (db, migrations, redis, storage, workers)

- [ ] **Step 4: Create MigrationsHealthIndicator**

Checks `_prisma_migrations` table for pending migrations by comparing applied vs bundled migration names.

- [ ] **Step 5: Create StorageHealthIndicator**

Checks MinIO bucket reachability.

- [ ] **Step 6: Create WorkersHealthIndicator**

Stub — returns healthy until BullMQ is wired (E04/E06 ship workers). For now returns `{ workers: 'ok', note: 'no workers registered yet' }`.

- [ ] **Step 7: Update HealthModule imports**

- [ ] **Step 8: Update AppModule** — change HealthModule import path

- [ ] **Step 9: Update compose.yml api healthcheck**

Change from `wget --spider -q http://localhost:4000/health` to `wget -q -O /dev/null http://localhost:4000/ready`

- [ ] **Step 10: Update Dockerfile.api** — add `HEALTHCHECK CMD wget -q -O /dev/null http://localhost:4000/ready || exit 1`

- [ ] **Step 11: Create web-verify/app/api/ready/route.ts**

Calls API `/ready` and returns result. Also includes build ID check.

- [ ] **Step 12: Create web-admin/app/api/ready/route.ts** — same pattern

- [ ] **Step 13: Run lint + typecheck + test**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 14: Commit**

```bash
git add -A && git commit -m "feat(E17): health/ready split — liveness never touches DB, readiness checks all deps"
```

---

## Phase 2: Compose Observability Stack

### Task 6: Compose Observability Stack (T6)

**Files:**
- Create: `docker/observability/otel-collector/config.yaml`
- Create: `docker/observability/prometheus/prometheus.yml`
- Create: `docker/observability/loki/loki-config.yaml`
- Create: `docker/observability/tempo/tempo.yaml`
- Create: `docker/observability/grafana/provisioning/datasources/datasources.yaml`
- Modify: `docker/compose.yml` (add observability services with profile)
- Modify: `.env.example` (add COMPOSE_PROFILES, E17 port vars)
- Modify: `docker/Dockerfile.api` (expose 9464)

- [ ] **Step 1: Create otel-collector config**

OTLP receiver on 4317/4318, exporters: traces→Tempo, metrics→Prometheus remote_write, logs→Loki

- [ ] **Step 2: Create Prometheus config**

Scrape targets: `api:9464`, `otel-collector:8889`, `uptime-probe:9465`

- [ ] **Step 3: Create Loki config**

Filesystem storage, 7-day retention, OTLP ingestion from collector

- [ ] **Step 4: Create Tempo config**

OTLP ingestion, local storage

- [ ] **Step 5: Create Grafana provisioning**

Datasources: Prometheus, Loki, Tempo with trace↔log correlation on `traceId`

- [ ] **Step 6: Add services to docker/compose.yml**

All behind `observability` profile. Use env vars for host ports. Services: grafana, loki, tempo, prometheus, otel-collector, uptime-probe (placeholder for now).

- [ ] **Step 7: Add COMPOSE_PROFILES to .env.example**

`COMPOSE_PROFILES=default,observability`

- [ ] **Step 8: Validate compose config**

```bash
docker compose -f docker/compose.yml --profile observability config > /dev/null
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(E17): compose observability stack — Grafana, Loki, Tempo, Prometheus, OTel collector"
```

---

### Task 7: Grafana Dashboards (T7)

**Files:**
- Create: `docker/observability/grafana/provisioning/dashboards/dashboard.yaml`
- Create: `docker/observability/grafana/provisioning/dashboards/verify-path.json`
- Create: `docker/observability/grafana/provisioning/dashboards/platform.json`
- Create: `docker/observability/grafana/provisioning/dashboards/synthetic.json`
- Create: `docker/observability/grafana/provisioning/dashboards/logs-explorer.json`

- [ ] **Step 1: Create dashboard provisioning config**

- [ ] **Step 2: Create Verify Path dashboard**

Panels: p50/p95/p99 latency by tier, RPS, error rate 5xx%, verdict distribution, rate-limit hits

- [ ] **Step 3: Create Platform dashboard**

Panels: Node event-loop lag, heap, DB pool, Redis, BullMQ depth/lag

- [ ] **Step 4: Create Synthetic dashboard**

Panels: probe success, latency, 30-day uptime

- [ ] **Step 5: Create Logs Explorer dashboard**

Variables: tenantId, requestId. Log panel with Loki queries.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(E17): Grafana dashboards — Verify Path, Platform, Synthetic, Logs Explorer"
```

---

### Task 8: Alert Rules + Alert Bridge (T8)

**Files:**
- Create: `docker/observability/grafana/provisioning/alerting/alert-rules.yaml`
- Create: `docker/observability/grafana/provisioning/alerting/contact-points.yaml`
- Create: `apps/api/src/modules/alerts/alerts.controller.ts`
- Create: `apps/api/src/modules/alerts/alerts.module.ts`
- Create: `apps/api/src/modules/alerts/alerts.service.ts`
- Create: `apps/api/src/modules/alerts/notification.stub.ts`

- [ ] **Step 1: Create alert rules in Grafana provisioning**

Five rules: VerifyErrorRateHigh, VerifyLatencyP95High, QueueLagHigh, ProbeFailing, ReadinessFailing

- [ ] **Step 2: Create contact point (webhook to api)**

Contact point = webhook to `http://api:4000/internal/alerts` with `ALERT_WEBHOOK_SECRET`

- [ ] **Step 3: Create AlertsController**

`POST /internal/alerts` — receives Grafana webhook, validates shared secret, emits `ops.alert.fired/resolved` events

- [ ] **Step 4: Create AlertsService**

Emits Nest `EventEmitter` events. Stubs E14's `NotificationService.send()` — logs alert dispatch for now.

- [ ] **Step 5: Create NotificationStub**

Minimal implementation that logs what would be sent. Real E14 integration when it ships.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(E17): alert rules, alert bridge, notification stub for ops.alert"
```

---

## Phase 3: Probe + Status

### Task 9: Uptime Probe Container (T9)

**Files:**
- Create: `tools/uptime-probe/package.json`
- Create: `tools/uptime-probe/src/index.ts`
- Create: `tools/uptime-probe/Dockerfile`
- Create: `tools/uptime-probe/tsconfig.json`

- [ ] **Step 1: Create uptime-probe package**

Tiny Node.js app that every 30s:
- Requests `GET api:4000/v1/verify/<PROBE_FIXTURE_CODE>` with `x-synthetic-probe` header
- Requests `GET web-verify:3000/`
- Requests `GET web-admin:3001/api/ready`
- Posts each result to `POST api:4000/v1/status/probe`
- Exposes `/metrics` (Prometheus) and `/health`

- [ ] **Step 2: Create Dockerfile**

Multi-stage build, minimal image.

- [ ] **Step 3: Add to compose.yml as uptime-probe service**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(E17): uptime-probe container — synthetic checks every 30s"
```

---

### Task 10: StatusModule (T10)

**Files:**
- Create: `apps/api/src/modules/status/status.module.ts`
- Create: `apps/api/src/modules/status/status.controller.ts`
- Create: `apps/api/src/modules/status/status.service.ts`
- Create: `apps/api/src/modules/status/probe-result.service.ts`
- Create: `apps/api/src/modules/status/status-daily.service.ts`
- Modify: `packages/db/prisma/schema.prisma` (add E17 block: ProbeResult, StatusDaily)
- Create: migration E17_probe_results
- Create: `apps/api/src/modules/status/status.service.spec.ts`

- [ ] **Step 1: Add E17 models to schema.prisma**

Add ProbeResult and StatusDaily models in an E17 block.

- [ ] **Step 2: Run migration**

```bash
pnpm db:migrate -- --create-only --name E17_probe_results
```

- [ ] **Step 3: Write status service tests**

Test state derivation: operational/degraded/outage based on probe history.

- [ ] **Step 4: Implement StatusService**

- `ingestProbe()` — store ProbeResult
- `deriveState()` — operational (last 5 ok), degraded (p95>300ms or 1-2 failures in last 10), outage (≥3 of last 5 failed)
- `getStatus()` — public endpoint data
- `getHistory(days)` — daily uptime %
- `emitProbeFailed()` — after 2 consecutive failures

- [ ] **Step 5: Implement StatusDailyService**

Nightly roll from ProbeResult to StatusDaily. Uses BullMQ repeatable job.

- [ ] **Step 6: Implement StatusController**

- `POST /v1/status/probe` — internal, requires `x-synthetic-probe`
- `GET /v1/status` — public, cached 30s
- `GET /v1/status/history` — public, query param `days`

- [ ] **Step 7: Create StatusModule**

- [ ] **Step 8: Add verify stub for probe target**

Minimal `GET /v1/verify/:code` stub that returns `{ verdict: 'ok', tier: 1 }` for the probe fixture code. Real E06 integration when it ships.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(E17): StatusModule — probe ingest, state derivation, public status API"
```

---

### Task 11: Status Page in web-verify (T11)

**Files:**
- Create: `apps/web-verify/app/status/page.tsx`
- Create: `apps/web-verify/app/status/layout.tsx`

- [ ] **Step 1: Create status page**

Server-rendered, `revalidate = 30`. Reads `GET /v1/status`:
- Overall state pill (green/yellow/red)
- Per-component rows
- 30-day uptime bar (one cell per day from `/history`)
- "Last checked" time
- Platform-branded, no tenant theming
- Accessible, no JS required
- Link back to `/`

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(E17): public status page in web-verify"
```

---

## Phase 4: Docs + CI

### Task 12: SLO Document (T12)

**Files:**
- Create: `docs/slo.md`

- [ ] **Step 1: Write SLO document**

SLIs, SLOs (99.9% availability, p95 < 300ms), error-budget policy, burn-rate alert mapping.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs(E17): SLO document — availability, latency, error-budget policy"
```

---

### Task 13: Incident Runbook (T13)

**Files:**
- Create: `docs/runbooks/verify-api-down.md`

- [ ] **Step 1: Write runbook**

Detection, first 5 minutes, likely causes, communication, post-incident review template, rehearsal script.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs(E17): verify API down runbook with rehearsal script"
```

---

### Task 14: CI Smoke Tests (T14)

**Files:**
- Create: `apps/api/src/modules/status/status.controller.spec.ts` (integration)
- Create: `e2e/status.spec.ts` (Playwright)
- Modify: compose smoke validation

- [ ] **Step 1: Write integration tests for StatusModule**

- [ ] **Step 2: Write Playwright test for /status page**

- [ ] **Step 3: Validate compose config with observability profile**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(E17): CI smoke tests — status page, compose config, metrics validation"
```

---

## Acceptance Criteria Mapping

| AC | Tasks |
|---|---|
| AC1 (compose healthy + Grafana dashboards) | T6, T7 |
| AC2 (verify metrics in Prometheus) | T1, T3, T6 |
| AC3 (JSON logs with context + no codes) | T2 |
| AC4 (trace correlation Loki↔Tempo) | T1, T2, T6 |
| AC5 (health/ready split) | T5 |
| AC6 (alert → Mailpit + status page outage) | T8, T9, T10, T11 |
| AC7 (latency alert) | T3, T8 |
| AC8 (error tracking) | T4 |
| AC9 (probe results + no ScanEvent pollution) | T9, T10 |
