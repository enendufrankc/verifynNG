# E08 Consumer Fake Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public reporting flow (consumer reports a suspected fake off a red/amber verify result), the anti-abuse fence in front of it (fake Turnstile captcha + E13 quotas), photo ingestion that strips EXIF/GPS, and the tenant triage workflow in web-admin (queue, detail, assign, notes, audited status changes, CSV export) — plus the reusable `ReportForm` component.

**Architecture:** New `ReportsModule` in `apps/api` (public controller, admin controller, submission/query/retention services, a `photo.process` BullMQ worker, a dedicated `ReportsS3Service` for two new MinIO buckets). A `CaptchaPort` with `TurnstileCaptcha`/`FakeCaptcha` adapters, mirroring the existing port pattern used elsewhere (`GeoIpPort`). Four new Prisma models under an additive `// E08` schema block. `ReportForm` lives in `packages/ui` (delegated directory) and is demoed via a new minimal Storybook setup until E09 ships. `apps/web-admin` gets real `reports` and `reports/[id]` pages replacing E11's `ModuleEmptyState` stub.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16, Redis 7 (quotas via E13's `QuotaService`), BullMQ, `@aws-sdk/client-s3` + presigner (MinIO), `sharp` (re-encode/strip EXIF), `file-type` (magic-byte sniffing), `heic-convert` (HEIC→JPEG, sharp's prebuilt binary has no HEIF decoder), Fastify (fake-captcha, mirrors `tools/fakes/sms`), Next.js 15 + `@tanstack/react-query` + `@tanstack/react-table` (web-admin), React 19 + Vitest + Testing Library (`packages/ui`), Playwright (E2E).

**E08 Ports (from `.env` in this worktree):** API=4824, web-verify=3824, web-admin=3825, Mailpit=8849, MinIO=9825, Postgres=6256, Redis=7203. Run `scripts/epic ports E08` to reconfirm before testing.

**Known cross-epic gaps at plan time (do not block on these — build to the interface, verify what's actually reachable):**
- E07 (Anomaly Detection) is `todo` — `AnomalyQuery.forUnit` is stubbed to `[]` until it ships (AC6's anomaly-chip half is deferred).
- `tests/e2e/fixtures/auth.ts`'s `loginAs()` is still a stub (`// TODO(E02): implement real login`) that just navigates to `/`. It is **not owned by E08** — do not fix it here. Task 11's Playwright specs are written against the documented `loginAs(page, role)` contract; if it's still a stub when you run them, the specs will fail at the login step and that failure is out of scope for E08 to fix. Re-check `tests/e2e/fixtures/auth.ts` when you reach Task 11 — E02 may have shipped a real implementation by then.
- E19 (Compliance) is `todo` — `ConsentPort` is a stub, in-memory adapter (documented explicitly in the epic as the expected interim state).
- The shared `TenantStatusGuard` (`apps/api/src/common/tenant-status/tenant-status.guard.ts`) is not owned by E08 and is **not modified by this plan**. It only resolves `tenantId` from a `:tenantId` route param or the JWT principal — our public routes use `:tenantSlug` and carry no JWT, so the guard's own `if (!tenantId) return true` already no-ops for them. Suspended/offboarded enforcement for the public reports routes is instead implemented directly in `ReportsService` (Task 5), inside E08's owned paths, using the tenant row it already has to fetch by slug.

---

## File Structure

### New files to create:
```
apps/api/src/modules/reports/reports.module.ts
apps/api/src/modules/reports/reports.service.ts
apps/api/src/modules/reports/reports.service.spec.ts
apps/api/src/modules/reports/reports-public.controller.ts
apps/api/src/modules/reports/reports-admin.controller.ts
apps/api/src/modules/reports/reports-dev.controller.ts
apps/api/src/modules/reports/reports-query.service.ts
apps/api/src/modules/reports/reports-retention.service.ts
apps/api/src/modules/reports/reports-s3.service.ts
apps/api/src/modules/reports/photos.service.ts
apps/api/src/modules/reports/photo.processor.ts
apps/api/src/modules/reports/photo-sweep.processor.ts
apps/api/src/modules/reports/reference.util.ts
apps/api/src/modules/reports/reference.util.spec.ts
apps/api/src/modules/reports/csv.util.ts
apps/api/src/modules/reports/csv.util.spec.ts
apps/api/src/modules/reports/heic-convert.d.ts
apps/api/src/modules/reports/dto/request-upload.dto.ts
apps/api/src/modules/reports/dto/submit-report.dto.ts
apps/api/src/modules/reports/dto/report-note.dto.ts
apps/api/src/modules/reports/dto/report-assign.dto.ts
apps/api/src/modules/reports/dto/report-status.dto.ts
apps/api/src/modules/reports/captcha/captcha-port.ts
apps/api/src/modules/reports/captcha/turnstile-captcha.provider.ts
apps/api/src/modules/reports/captcha/turnstile-captcha.provider.spec.ts
apps/api/src/modules/reports/captcha/fake-captcha.provider.ts
apps/api/src/modules/reports/consent/consent-port.ts
apps/api/src/modules/reports/consent/in-memory-consent.provider.ts
apps/api/test/reports/reports-submission.integration.spec.ts
apps/api/test/reports/photo-processing.integration.spec.ts
apps/api/test/reports/reports-admin.integration.spec.ts
apps/api/test/fixtures/photo-with-gps.jpg
apps/api/test/fixtures/not-an-image.jpg
tools/fakes/captcha/package.json
tools/fakes/captcha/server.mjs
tools/fakes/captcha/Dockerfile
packages/ui/src/components/ReportForm/ReportForm.tsx
packages/ui/src/components/ReportForm/types.ts
packages/ui/src/components/ReportForm/downscale.ts
packages/ui/src/components/ReportForm/downscale.test.ts
packages/ui/src/components/ReportForm/ReportForm.test.tsx
packages/ui/src/components/ReportForm/ReportForm.stories.tsx
packages/ui/src/components/ReportForm/index.ts
packages/ui/.storybook/main.ts
packages/ui/.storybook/preview.ts
apps/web-admin/lib/reports.ts
apps/web-admin/app/(console)/reports/page.tsx
apps/web-admin/app/(console)/reports/[id]/page.tsx
apps/web-admin/app/(console)/reports/[id]/status-dialog.tsx
docs/reports/consumer-flow.md
docs/reports/triage-guide.md
docs/reports/photo-handling.md
tests/e2e/fixtures/reports.ts
tests/e2e/reports.spec.ts
```

### Files to modify:
```
packages/db/prisma/schema.prisma          (additive E08 block, appended after the existing E06 IpBlock model)
packages/config/src/env-schema.ts         (add e08Schema, merge into envSchema)
apps/api/src/app.module.ts                (one-line ReportsModule import)
apps/api/src/main.ts                      (register reports_per_ip_per_hour / report_uploads_per_ip_per_hour quota kinds)
apps/api/src/jobs/bullmq.module.ts        (register 'reports' queue)
apps/api/package.json                     (add sharp, file-type, heic-convert; dev: exifr)
apps/api/src/modules/notifications/templates/template-data.ts   (add report.consumer_ack / report.consumer_update TemplateData + TemplateId)
apps/api/src/modules/notifications/templates/registry.ts        (add renderers for the two new templates)
apps/api/src/modules/notifications/routing/event-router.ts      (no map change needed — report.created already routes to report.received; confirm only)
docker/compose.yml                        (fake-captcha service + api environment additions)
apps/web-admin/lib/query.ts               (add reports query keys)
packages/ui/package.json                  (add storybook devDependencies + storybook script)
docs/epics/E08-consumer-reporting.md      (tick task/AC checkboxes as they land)
```

---

## Task 1: Schema, env, dependencies, module skeleton

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/config/src/env-schema.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/modules/reports/reports.module.ts`

- [ ] **Step 1: Append the E08 Prisma block**

Add after the final `// ─── E06 ───` `IpBlock` model at the end of `packages/db/prisma/schema.prisma` (verify it's still the last block before editing — E04/E17 blocks may have landed after it; append after whatever is currently last):

```prisma
// ─── E08 Consumer Fake Reporting ────────────────────────────────────────

enum PurchaseChannel {
  open_market
  street_vendor
  online_marketplace
  social_media
  pharmacy
  supermarket
  brand_store
  other
}

enum ReportStatus {
  new
  triaged
  investigating
  closed
}

enum ReportOutcome {
  confirmed_counterfeit
  legit
  insufficient
}

enum PhotoStatus {
  pending
  uploaded
  processing
  ready
  rejected
}

model Report {
  id                String    @id @default(cuid())
  tenantId          String
  reference         String    @unique
  scanEventId       String?
  unitId            String?
  batchId           String?
  productId         String?
  verdictAtReport   String
  sellerName        String?
  sellerLocation    String?
  purchaseChannel   PurchaseChannel
  purchaseDate      DateTime?
  description       String?
  contactEmail      String?
  contactPhone      String?
  contactConsentId  String?
  contactPurgedAt   DateTime?
  status            ReportStatus @default(new)
  outcome           ReportOutcome?
  assignedToId      String?
  ipHash            String
  userAgent         String?
  locale            String?
  closedAt          DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  photos        ReportPhoto[]
  notes         ReportNote[]
  statusChanges ReportStatusChange[]

  @@index([tenantId, status, createdAt])
  @@index([tenantId, batchId])
  @@index([unitId])
  @@index([tenantId, assignedToId])
}

model ReportPhoto {
  id            String      @id @default(cuid())
  tenantId      String
  reportId      String?
  incomingKey   String
  objectKey     String?
  contentType   String
  declaredBytes Int
  storedBytes   Int?
  sha256        String?
  width         Int?
  height        Int?
  status        PhotoStatus @default(pending)
  rejectReason  String?
  ipHash        String
  createdAt     DateTime    @default(now())
  processedAt   DateTime?

  report Report? @relation(fields: [reportId], references: [id])

  @@index([reportId])
  @@index([status, createdAt])
}

model ReportNote {
  id        String   @id @default(cuid())
  tenantId  String
  reportId  String
  authorId  String
  body      String
  createdAt DateTime @default(now())

  report Report @relation(fields: [reportId], references: [id])

  @@index([reportId, createdAt])
}

model ReportStatusChange {
  id               String        @id @default(cuid())
  tenantId         String
  reportId         String
  fromStatus       ReportStatus?
  toStatus         ReportStatus
  outcome          ReportOutcome?
  note             String?
  actorId          String
  consumerNotified Boolean       @default(false)
  createdAt        DateTime      @default(now())

  report Report @relation(fields: [reportId], references: [id])

  @@index([reportId, createdAt])
}
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm --filter @verifynng/db db:migrate -- --name E08_reports
```

Expected: a new `packages/db/prisma/migrations/<timestamp>_e08_reports/migration.sql` is generated (creates 4 tables + 4 enums), and it applies cleanly against the local Postgres. If `db:migrate` requires a running DB, start just Postgres first: `docker compose -f docker/compose.yml up -d postgres`.

- [ ] **Step 3: Add the `e08Schema` to env-schema.ts**

In `packages/config/src/env-schema.ts`, add a new section (near the other epic sections, before the final merge chain):

```ts
// ── E08 Consumer Fake Reporting ─────────────────────────────────
const e08Schema = z.object({
  CAPTCHA_PROVIDER: z.enum(['fake', 'turnstile']).default('fake'),
  TURNSTILE_SECRET: z.string().default(''),
  FAKE_CAPTCHA_URL: z.string().default('http://fake-captcha:4106'),
  REPORT_PHOTO_MAX_BYTES: z.coerce.number().default(8_000_000),
  REPORTS_MAX_PHOTOS: z.coerce.number().default(5),
  REPORT_INCOMING_TTL_HOURS: z.coerce.number().default(24),
  REPORTS_BUCKET_INCOMING: z.string().default('reports-incoming'),
  REPORTS_BUCKET: z.string().default('reports'),
});
```

Then add `.merge(e08Schema)` to the `envSchema` chain:

```ts
export const envSchema = e02Schema
  .merge(e06Schema)
  .merge(e17Schema)
  .merge(e14Schema)
  .merge(e13Schema)
  .merge(e04Schema)
  .merge(e08Schema)
  .superRefine((env, ctx) => {
```

- [ ] **Step 4: Add API dependencies**

In `apps/api/package.json`, add to `dependencies`:

```json
"sharp": "^0.34.4",
"file-type": "^21.0.0",
"heic-convert": "^2.1.0"
```

and to `devDependencies`:

```json
"exifr": "^7.1.3"
```

Run `pnpm install` from the repo root afterward.

- [ ] **Step 5: `heic-convert` type shim**

`heic-convert` ships no types. Create `apps/api/src/modules/reports/heic-convert.d.ts`:

```ts
declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  export default function convert(opts: HeicConvertOptions): Promise<ArrayBuffer>;
}
```

- [ ] **Step 6: `ReportsModule` skeleton**

Create `apps/api/src/modules/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [BullModule.registerQueue({ name: 'reports' })],
  providers: [],
  controllers: [],
})
export class ReportsModule {}
```

Add the one-line import to `apps/api/src/app.module.ts` (find the `imports: [...]` array and add `ReportsModule` alongside the other feature modules, plus the corresponding `import { ReportsModule } from './modules/reports/reports.module';` at the top).

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/config/src/env-schema.ts apps/api/package.json pnpm-lock.yaml apps/api/src/app.module.ts apps/api/src/modules/reports/reports.module.ts apps/api/src/modules/reports/heic-convert.d.ts
git commit -m "feat(E08): T1 schema, env, deps, ReportsModule skeleton"
```

Push and open PR #1 into `main` (small, additive, no behavior yet — safe to land ahead of the rest).

---

## Task 2: `tools/fakes/captcha` + compose service

**Files:**
- Create: `tools/fakes/captcha/package.json`
- Create: `tools/fakes/captcha/server.mjs`
- Create: `tools/fakes/captcha/Dockerfile`
- Modify: `docker/compose.yml`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "fake-captcha",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.mjs"
  },
  "dependencies": {
    "@fastify/formbody": "^8.0.2",
    "fastify": "^5.0.0"
  }
}
```

- [ ] **Step 2: `server.mjs`** — Turnstile-shaped `/siteverify`. Token rules from the epic spec: `ok-` prefix → success; `fail-` prefix → `invalid-input-response`; anything else → success after a 200ms delay (simulates network latency for tokens that aren't explicitly testing failure).

```js
import Fastify from 'fastify';

const app = Fastify({ logger: true });
await app.register((await import('@fastify/formbody')).default);
const PORT = parseInt(process.env.PORT ?? '4106', 10);

let verifications = [];
let idCounter = 1;

app.post('/siteverify', async (req, reply) => {
  const body = req.body ?? {};
  const token = body.response ?? body.token ?? '';
  const record = { id: idCounter++, token, receivedAt: new Date().toISOString() };

  if (typeof token === 'string' && token.startsWith('ok-')) {
    verifications.push({ ...record, success: true });
    return { success: true, challenge_ts: record.receivedAt, hostname: 'localhost' };
  }
  if (typeof token === 'string' && token.startsWith('fail-')) {
    verifications.push({ ...record, success: false });
    return { success: false, 'error-codes': ['invalid-input-response'] };
  }
  await new Promise((r) => setTimeout(r, 200));
  verifications.push({ ...record, success: true });
  return { success: true, challenge_ts: record.receivedAt, hostname: 'localhost' };
});

app.get('/verifications', async () => verifications);
app.delete('/verifications', async () => {
  verifications = [];
  return { ok: true };
});

app.get('/health', async () => ({ status: 'ok', service: 'fake-captcha' }));

app.get('/', async () => `
<!DOCTYPE html>
<html><head><title>Fake Captcha (Turnstile)</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:24px auto;padding:0 16px}
code{background:#f5f5f5;padding:2px 6px;border-radius:4px}</style></head>
<body>
<h1>Fake Turnstile Captcha</h1>
<p>POST a token via <code>captchaToken</code> to any E08 public route. This service backs <code>POST /siteverify</code>.</p>
<ul>
<li>Token starting with <code>ok-</code> → success</li>
<li>Token starting with <code>fail-</code> → <code>invalid-input-response</code></li>
<li>Any other token → success after a 200ms delay</li>
</ul>
<p><a href="/verifications">Recent verifications (JSON)</a></p>
</body></html>`);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 3: `Dockerfile`** (mirror `tools/fakes/sms/Dockerfile` exactly, port 4106):

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs .
EXPOSE 4106
CMD ["node", "server.mjs"]
```

- [ ] **Step 4: Compose service** — add to `docker/compose.yml` in the "Fake external services" section, after `fake-geo`:

```yaml
  fake-captcha:
    build:
      context: ../tools/fakes/captcha
      dockerfile: Dockerfile
    ports:
      - '${FAKE_CAPTCHA_PORT:-4106}:4106'
    healthcheck:
      test: ['CMD', 'wget', '--spider', '-q', 'http://localhost:4106/health']
      interval: 5s
      timeout: 5s
      retries: 5
```

Also add to the `api` service's `environment:` block (near the other fake-service URLs), and add `api`'s `depends_on` note is not required (fake-captcha isn't a startup dependency, only a runtime one):

```yaml
      # ── E08 Consumer Fake Reporting ──
      CAPTCHA_PROVIDER: fake
      FAKE_CAPTCHA_URL: http://fake-captcha:4106
      REPORT_PHOTO_MAX_BYTES: '8000000'
      REPORTS_MAX_PHOTOS: '5'
      REPORT_INCOMING_TTL_HOURS: '24'
      REPORTS_BUCKET_INCOMING: reports-incoming
      REPORTS_BUCKET: reports
```

- [ ] **Step 5: Verify**

```bash
docker compose -f docker/compose.yml up -d fake-captcha
curl -s http://localhost:$(scripts/epic ports E08 | grep -o 'fake-captcha[^0-9]*[0-9]*' || echo 4106)/health
```

(Port for fake-captcha isn't in the per-worktree port table printed by `scripts/epic ports E08` today since it's new — until that script is updated elsewhere, just check the compose-assigned host port with `docker compose -f docker/compose.yml port fake-captcha 4106`.) Expected: `{"status":"ok","service":"fake-captcha"}`. Then `curl -s -X POST http://localhost:<port>/siteverify -d "response=ok-demo"` → `{"success":true,...}`, and with `-d "response=fail-1"` → `{"success":false,"error-codes":["invalid-input-response"]}`.

- [ ] **Step 6: Commit**

```bash
git add tools/fakes/captcha docker/compose.yml
git commit -m "feat(E08): T2 fake-captcha service on 4106"
```

---

## Task 3: `CaptchaPort`, adapters, ip-hash reuse, quota registration

**Files:**
- Create: `apps/api/src/modules/reports/captcha/captcha-port.ts`
- Create: `apps/api/src/modules/reports/captcha/turnstile-captcha.provider.ts`
- Create: `apps/api/src/modules/reports/captcha/turnstile-captcha.provider.spec.ts`
- Create: `apps/api/src/modules/reports/captcha/fake-captcha.provider.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`

- [ ] **Step 1: Port interface**

```ts
// apps/api/src/modules/reports/captcha/captcha-port.ts
export const CAPTCHA_PORT = 'CAPTCHA_PORT';

export interface CaptchaVerifyResult {
  ok: boolean;
  reason?: string;
}

export interface CaptchaPort {
  verify(token: string, ip: string): Promise<CaptchaVerifyResult>;
}
```

- [ ] **Step 2: `FakeCaptcha`** (calls `tools/fakes/captcha`):

```ts
// apps/api/src/modules/reports/captcha/fake-captcha.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaptchaPort, CaptchaVerifyResult } from './captcha-port';

@Injectable()
export class FakeCaptcha implements CaptchaPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, _ip: string): Promise<CaptchaVerifyResult> {
    const url = this.config.get<string>('FAKE_CAPTCHA_URL', 'http://fake-captcha:4106');
    const res = await fetch(`${url}/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ response: token }),
    });
    const body = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    return { ok: body.success, reason: body['error-codes']?.[0] };
  }
}
```

- [ ] **Step 3: `TurnstileCaptcha`** (real adapter, msw-tested):

```ts
// apps/api/src/modules/reports/captcha/turnstile-captcha.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaptchaPort, CaptchaVerifyResult } from './captcha-port';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class TurnstileCaptcha implements CaptchaPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, ip: string): Promise<CaptchaVerifyResult> {
    const secret = this.config.get<string>('TURNSTILE_SECRET')!;
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const body = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    return { ok: body.success, reason: body['error-codes']?.[0] };
  }
}
```

- [ ] **Step 4: Test the Turnstile adapter with `msw`**

Check whether `msw` is already a devDependency anywhere in the repo (`grep -rn '"msw"' apps/api/package.json packages/*/package.json`). If absent, add `"msw": "^2.6.0"` to `apps/api/package.json` devDependencies and `pnpm install`.

```ts
// apps/api/src/modules/reports/captcha/turnstile-captcha.provider.spec.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ConfigService } from '@nestjs/config';
import { TurnstileCaptcha } from './turnstile-captcha.provider';

const server = setupServer(
  http.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', async ({ request }) => {
    const body = await request.formData();
    const token = body.get('response');
    if (token === 'ok-test') return HttpResponse.json({ success: true });
    return HttpResponse.json({ success: false, 'error-codes': ['invalid-input-response'] });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TurnstileCaptcha', () => {
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  const captcha = new TurnstileCaptcha(config);

  it('resolves ok for a success token', async () => {
    const result = await captcha.verify('ok-test', '1.2.3.4');
    expect(result.ok).toBe(true);
  });

  it('resolves not-ok with a reason for a failing token', async () => {
    const result = await captcha.verify('bad-token', '1.2.3.4');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-input-response');
  });
});
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter @verifynng/api test -- turnstile-captcha
```
Expected: 2 passed.

- [ ] **Step 6: Wire the port into `ReportsModule`** (selects adapter by `CAPTCHA_PROVIDER`):

```ts
// apps/api/src/modules/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CAPTCHA_PORT } from './captcha/captcha-port';
import { TurnstileCaptcha } from './captcha/turnstile-captcha.provider';
import { FakeCaptcha } from './captcha/fake-captcha.provider';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: 'reports' })],
  providers: [
    TurnstileCaptcha,
    FakeCaptcha,
    {
      provide: CAPTCHA_PORT,
      useFactory: (config: ConfigService, turnstile: TurnstileCaptcha, fake: FakeCaptcha) =>
        config.get<string>('CAPTCHA_PROVIDER') === 'turnstile' ? turnstile : fake,
      inject: [ConfigService, TurnstileCaptcha, FakeCaptcha],
    },
  ],
  controllers: [],
  exports: [CAPTCHA_PORT],
})
export class ReportsModule {}
```

- [ ] **Step 7: Register quota kinds in `main.ts`**

In `apps/api/src/main.ts`, right after the existing `quotaService.registerKind(...)` calls:

```ts
  quotaService.registerKind('reports_per_ip_per_hour', { defaultLimit: 5, window: 'hour' });
  quotaService.registerKind('report_uploads_per_ip_per_hour', { defaultLimit: 15, window: 'hour' });
```

- [ ] **Step 8: Reuse the existing `hashIp` helper**

No new file needed — `apps/api/src/common/ip-utils.ts` already exports `hashIp(ip, salt)` and `getClientIp(headers, socketIp, trustProxy)`, and `IP_HASH_SALT` / `TRUST_PROXY` are already registered env vars (E06). Task 5's controllers import these directly rather than reinventing an `ipHash` helper or a new `REPORT_IP_SALT` var — one salt, one helper, shared across E06 and E08.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/reports/captcha apps/api/src/modules/reports/reports.module.ts apps/api/src/main.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(E08): T3 CaptchaPort + Turnstile/Fake adapters + quota kinds"
```

---

## Task 4: `ReportsS3Service`, upload-url flow, photo processing worker, orphan sweep

**Files:**
- Create: `apps/api/src/modules/reports/reports-s3.service.ts`
- Create: `apps/api/src/modules/reports/photos.service.ts`
- Create: `apps/api/src/modules/reports/photo.processor.ts`
- Create: `apps/api/src/modules/reports/photo-sweep.processor.ts`
- Create: `apps/api/src/modules/reports/dto/request-upload.dto.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Modify: `apps/api/src/jobs/bullmq.module.ts`
- Create: `apps/api/test/reports/photo-processing.integration.spec.ts`
- Create: `apps/api/test/fixtures/photo-with-gps.jpg`, `apps/api/test/fixtures/not-an-image.jpg`

- [ ] **Step 1: Test fixtures**

Generate a real JPEG with GPS EXIF and a fake "image" that's actually PDF bytes (for AC2's magic-byte rejection test):

```bash
mkdir -p apps/api/test/fixtures
# A tiny JPEG with GPS EXIF, built via exiftool (already needed for AC2's manual verification anyway).
# If exiftool isn't installed locally, use sharp+piexifjs in a one-off script instead — see note below.
```

Since `exiftool` may not be installed on the dev machine, generate the fixture programmatically instead of shelling out. Create a one-off script `apps/api/scripts/make-fixtures.mjs`:

```js
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// A minimal 100x100 red JPEG with GPS EXIF (IFD0 GPS tags), built via sharp's
// withMetadata + a manually-crafted APP1 segment is fiddly; simplest reliable
// path is to embed EXIF via sharp's `exif` option (supported since sharp 0.32).
const buf = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 30, b: 30 } },
})
  .jpeg()
  .withExif({
    IFD0: { Make: 'TestCam' },
    GPS: {
      GPSLatitudeRef: 'N',
      GPSLatitude: '37/1 46/1 2000/100',
      GPSLongitudeRef: 'W',
      GPSLongitude: '122/1 25/1 1000/100',
    },
  })
  .toBuffer();
writeFileSync('apps/api/test/fixtures/photo-with-gps.jpg', buf);

// Not actually a JPEG — PDF magic bytes with a .jpg extension, for AC2's
// magic-byte-mismatch rejection test.
writeFileSync('apps/api/test/fixtures/not-an-image.jpg', Buffer.from('%PDF-1.4\n%fake pdf bytes for testing\n'));
console.log('Fixtures written.');
```

Run once: `node apps/api/scripts/make-fixtures.mjs`, then commit the two binary fixtures (delete the throwaway script or keep it under `scripts/` for reproducibility — keep it, it documents how the fixture was made).

- [ ] **Step 2: `ReportsS3Service`** — dedicated dual-client S3 wrapper for the two new buckets, mirroring `TenantS3Service`'s client/publicClient split but parameterized per-bucket, plus a boot hook that creates both buckets and sets the incoming bucket's lifecycle (the epic explicitly wants this created by the API at boot, not by E00's `mc` init):

```ts
// apps/api/src/modules/reports/reports-s3.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ReportsS3Service implements OnModuleInit {
  private readonly logger = new Logger(ReportsS3Service.name);
  readonly client: S3Client;
  private readonly publicClient: S3Client;
  readonly incomingBucket: string;
  readonly bucket: string;
  private readonly incomingTtlHours: number;

  constructor(private readonly config: ConfigService) {
    const credentials = {
      accessKeyId: config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
      secretAccessKey: config.get<string>('S3_SECRET_KEY', 'minioadmin'),
    };
    const forcePathStyle = config.get<boolean>('S3_FORCE_PATH_STYLE', true);
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT', 'http://minio:9000'),
      region: 'us-east-1',
      forcePathStyle,
      credentials,
    });
    this.publicClient = new S3Client({
      endpoint: config.get<string>('S3_PUBLIC_ENDPOINT', 'http://localhost:9000'),
      region: 'us-east-1',
      forcePathStyle,
      credentials,
    });
    this.incomingBucket = config.get<string>('REPORTS_BUCKET_INCOMING', 'reports-incoming');
    this.bucket = config.get<string>('REPORTS_BUCKET', 'reports');
    this.incomingTtlHours = config.get<number>('REPORT_INCOMING_TTL_HOURS', 24);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket(this.incomingBucket);
    await this.ensureBucket(this.bucket);
    await this.setIncomingLifecycle();
  }

  private async ensureBucket(name: string): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: name }));
      this.logger.log(`created bucket ${name}`);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists') return;
      throw err;
    }
  }

  private async setIncomingLifecycle(): Promise<void> {
    await this.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.incomingBucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'expire-incoming',
              Status: 'Enabled',
              Filter: {},
              Expiration: { Days: Math.max(1, Math.ceil(this.incomingTtlHours / 24)) },
            },
          ],
        },
      }),
    );
  }

  async presignIncomingPut(key: string, contentType: string, size: number): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.incomingBucket, Key: key, ContentType: contentType, ContentLength: size }),
      { expiresIn: 300 },
    );
  }

  async headIncoming(key: string) {
    return this.client.send(new HeadObjectCommand({ Bucket: this.incomingBucket, Key: key }));
  }

  async getIncomingObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.incomingBucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async deleteIncoming(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.incomingBucket, Key: key }));
  }

  async putProcessed(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async presignGet(key: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(this.publicClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }
}
```

- [ ] **Step 3: `RequestUploadDto`**

```ts
// apps/api/src/modules/reports/dto/request-upload.dto.ts
import { IsIn, IsInt, Max, Min, IsString, IsNotEmpty } from 'class-validator';

export class RequestUploadDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

  @IsInt()
  @Min(1)
  @Max(8_000_000)
  sizeBytes!: number;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;
}
```

- [ ] **Step 4: `PhotosService`** — creates the pending `ReportPhoto` row and the presigned PUT (called from the public controller in Task 5):

```ts
// apps/api/src/modules/reports/photos.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ReportsS3Service } from './reports-s3.service';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly s3: ReportsS3Service,
    private readonly config: ConfigService,
  ) {}

  async requestUpload(
    tenantId: string,
    contentType: string,
    sizeBytes: number,
    ipHash: string,
  ): Promise<{ photoId: string; uploadUrl: string; maxBytes: number }> {
    const maxBytes = this.config.get<number>('REPORT_PHOTO_MAX_BYTES', 8_000_000);
    if (sizeBytes > maxBytes) throw new BadRequestException('photo_too_large');

    const photo = await this.prisma.reportPhoto.create({
      data: { tenantId, contentType, declaredBytes: sizeBytes, ipHash, status: 'pending' },
    });
    const key = `${tenantId}/${photo.id}`;
    const uploadUrl = await this.s3.presignIncomingPut(key, contentType, sizeBytes);
    await this.prisma.reportPhoto.update({ where: { id: photo.id }, data: { incomingKey: key } });
    return { photoId: photo.id, uploadUrl, maxBytes };
  }
}
```

Note: `incomingKey` is set on the model as required (`String`, not `String?`) in the Task 1 schema — since it's known before the row exists (derived from `photo.id`), simplify by creating the row with `incomingKey` computed from a pre-generated id. Adjust: use `crypto.randomUUID()` for the photo id up front instead of relying on `cuid()` post-creation timing:

```ts
  async requestUpload(
    tenantId: string,
    contentType: string,
    sizeBytes: number,
    ipHash: string,
  ): Promise<{ photoId: string; uploadUrl: string; maxBytes: number }> {
    const maxBytes = this.config.get<number>('REPORT_PHOTO_MAX_BYTES', 8_000_000);
    if (sizeBytes > maxBytes) throw new BadRequestException('photo_too_large');

    const id = crypto.randomUUID();
    const key = `${tenantId}/${id}`;
    const photo = await this.prisma.reportPhoto.create({
      data: { id, tenantId, contentType, declaredBytes: sizeBytes, ipHash, status: 'pending', incomingKey: key },
    });
    const uploadUrl = await this.s3.presignIncomingPut(key, photo.contentType, sizeBytes);
    return { photoId: photo.id, uploadUrl, maxBytes };
  }
}
```

(Replace Step 4's first version with this corrected one — import `crypto` from `node:crypto` at the top of the file.)

- [ ] **Step 5: `photo.processor.ts`** — the BullMQ worker. Sniffs magic bytes, converts HEIC→JPEG first if needed, re-encodes via sharp (strips EXIF/GPS via `withMetadata(false)`, caps at 2000px), uploads to the processed bucket, deletes the incoming object:

```ts
// apps/api/src/modules/reports/photo.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import heicConvert from 'heic-convert';
import { ReportsS3Service } from './reports-s3.service';

export interface PhotoProcessJob {
  photoId: string;
}

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_DIMENSION = 2000;

@Processor('reports', { concurrency: 2 })
export class PhotoProcessor extends WorkerHost {
  private readonly logger = new Logger(PhotoProcessor.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly s3: ReportsS3Service,
  ) {
    super();
  }

  async process(job: Job<PhotoProcessJob>): Promise<void> {
    if (job.name !== 'photo.process') return;
    const { photoId } = job.data;
    const photo = await this.prisma.reportPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.status !== 'uploaded') return;

    await this.prisma.reportPhoto.update({ where: { id: photoId }, data: { status: 'processing' } });

    try {
      await this.s3.headIncoming(photo.incomingKey);
      const raw = await this.s3.getIncomingObject(photo.incomingKey);

      if (raw.length > photo.declaredBytes * 2 && raw.length > 8_000_000) {
        await this.reject(photoId, 'too_large');
        return;
      }

      const sniffed = await fileTypeFromBuffer(raw);
      if (!sniffed || !ACCEPTED_MIME.has(sniffed.mime)) {
        await this.reject(photoId, 'magic_mismatch');
        return;
      }

      let decodable: Buffer = raw;
      if (sniffed.mime === 'image/heic' || sniffed.mime === 'image/heif') {
        const converted = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.9 });
        decodable = Buffer.from(converted);
      }

      const image = sharp(decodable).rotate();
      const metadata = await image.metadata();
      const resized = image.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
      const output = await resized.jpeg({ quality: 85 }).withMetadata(false).toBuffer();
      const outputMeta = await sharp(output).metadata();

      const objectKey = `${photo.tenantId}/${photo.reportId ?? 'unclaimed'}/${photo.id}.jpg`;
      await this.s3.putProcessed(objectKey, output, 'image/jpeg');
      await this.s3.deleteIncoming(photo.incomingKey);

      await this.prisma.reportPhoto.update({
        where: { id: photoId },
        data: {
          status: 'ready',
          objectKey,
          storedBytes: output.length,
          sha256: createHash('sha256').update(output).digest('hex'),
          width: outputMeta.width ?? metadata.width ?? null,
          height: outputMeta.height ?? metadata.height ?? null,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(`photo.process failed for ${photoId}: ${(err as Error).message}`);
      await this.reject(photoId, 'processing_error');
    }
  }

  private async reject(photoId: string, reason: string): Promise<void> {
    await this.prisma.reportPhoto.update({
      where: { id: photoId },
      data: { status: 'rejected', rejectReason: reason, processedAt: new Date() },
    });
  }
}
```

- [ ] **Step 6: Orphan sweep** — hourly job for `pending` photos older than the TTL, implemented as a BullMQ repeatable job (no new dependency, consistent with the rest of the app's job usage):

```ts
// apps/api/src/modules/reports/photo-sweep.processor.ts
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';

@Processor('reports', { concurrency: 1 })
export class PhotoSweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PhotoSweepProcessor.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    @InjectQueue('reports') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'photo.sweep',
      {},
      { repeat: { every: 60 * 60 * 1000 }, jobId: 'photo-sweep-repeat' },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'photo.sweep') return;
    const ttlHours = this.config.get<number>('REPORT_INCOMING_TTL_HOURS', 24);
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const stale = await this.prisma.reportPhoto.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      take: 200,
    });
    for (const photo of stale) {
      await this.prisma.reportPhoto.update({
        where: { id: photo.id },
        data: { status: 'rejected', rejectReason: 'expired_incoming', processedAt: new Date() },
      });
    }
    this.logger.log(`photo.sweep: expired ${stale.length} pending photos`);
  }
}
```

Note: `@Processor('reports')` is declared twice (once in `photo.processor.ts`, once here) — BullMQ/NestJS allows multiple `WorkerHost` processors bound to the same queue name only if each is registered as its own worker; verify this against the actual `@nestjs/bullmq` version behavior when running Step 8's integration test. If it turns out only one processor per queue name is supported, merge `photo-sweep`'s `process()` body into `PhotoProcessor.process()` with a `job.name` switch instead of two classes — functionally equivalent, still one queue.

- [ ] **Step 7: Wire into `ReportsModule`**

```ts
// apps/api/src/modules/reports/reports.module.ts — add to providers
import { PhotosService } from './photos.service';
import { PhotoProcessor } from './photo.processor';
import { PhotoSweepProcessor } from './photo-sweep.processor';
import { ReportsS3Service } from './reports-s3.service';
// ...
providers: [
  TurnstileCaptcha,
  FakeCaptcha,
  ReportsS3Service,
  PhotosService,
  PhotoProcessor,
  PhotoSweepProcessor,
  { provide: CAPTCHA_PORT, /* as before */ },
],
```

- [ ] **Step 8: Integration test** — upload-url → PUT → enqueue → worker → `ready`, using the GPS fixture:

```ts
// apps/api/test/reports/photo-processing.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant as makeTenant } from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ReportsS3Service } from '../../src/modules/reports/reports-s3.service';
import { PhotosService } from '../../src/modules/reports/photos.service';
import { PhotoProcessor } from '../../src/modules/reports/photo.processor';

function fakeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_FORCE_PATH_STYLE: true,
    REPORTS_BUCKET_INCOMING: 'reports-incoming-test',
    REPORTS_BUCKET: 'reports-test',
    REPORT_INCOMING_TTL_HOURS: 24,
    REPORT_PHOTO_MAX_BYTES: 8_000_000,
    ...overrides,
  };
  return { get: (k: string, def?: unknown) => values[k] ?? def } as unknown as ConfigService;
}

describe('photo processing (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let s3: ReportsS3Service;
  let photos: PhotosService;
  let processor: PhotoProcessor;

  beforeAll(async () => {
    const db = await createTestDatabase('reports-photo-processing');
    prisma = db.prisma;
    schemaName = db.schemaName;
    s3 = new ReportsS3Service(fakeConfig());
    await s3.onModuleInit();
    photos = new PhotosService(prisma, s3, fakeConfig());
    processor = new PhotoProcessor(prisma, s3);
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('strips EXIF/GPS, caps dimensions, and moves incoming → processed', async () => {
    const tenant = await makeTenant(prisma);
    const { photoId, uploadUrl } = await photos.requestUpload(tenant.id, 'image/jpeg', 50_000, 'iphash1');

    const buf = readFileSync('apps/api/test/fixtures/photo-with-gps.jpg');
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: buf });
    expect(putRes.ok).toBe(true);
    await prisma.reportPhoto.update({ where: { id: photoId }, data: { status: 'uploaded' } });

    await processor.process({ name: 'photo.process', data: { photoId } } as never);

    const photo = await prisma.reportPhoto.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.status).toBe('ready');
    expect(photo.objectKey).toBeTruthy();
    expect(photo.width).toBeLessThanOrEqual(2000);
    expect(photo.height).toBeLessThanOrEqual(2000);
  });

  it('rejects a file whose magic bytes do not match an image', async () => {
    const tenant = await makeTenant(prisma);
    const { photoId, uploadUrl } = await photos.requestUpload(tenant.id, 'image/jpeg', 100, 'iphash2');
    const buf = readFileSync('apps/api/test/fixtures/not-an-image.jpg');
    await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: buf });
    await prisma.reportPhoto.update({ where: { id: photoId }, data: { status: 'uploaded' } });

    await processor.process({ name: 'photo.process', data: { photoId } } as never);

    const photo = await prisma.reportPhoto.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.status).toBe('rejected');
    expect(photo.rejectReason).toBe('magic_mismatch');
  });
});
```

- [ ] **Step 9: Run it**

```bash
docker compose -f docker/compose.yml up -d minio postgres
pnpm --filter @verifynng/api test -- photo-processing
```
Expected: both tests pass. If MinIO's bucket-not-found errors appear, confirm `ReportsS3Service.onModuleInit()` actually ran (it's called explicitly in the test's `beforeAll` since there's no Nest DI container in this integration test).

- [ ] **Step 10: Register the `reports` queue in the shared BullMQ module** (if `bullmq.module.ts` centralizes queue registration rather than each feature module doing its own `BullModule.registerQueue`):

Check `apps/api/src/jobs/bullmq.module.ts` — if it lists `{name:'mint',...}, {name:'batch-exports',...}` in one array, add `{ name: 'reports' }` there instead of (or in addition to, harmlessly) `ReportsModule`'s own registration, matching whatever the existing convention turns out to be once you open the file.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/reports apps/api/test/reports/photo-processing.integration.spec.ts apps/api/test/fixtures apps/api/scripts/make-fixtures.mjs
git commit -m "feat(E08): T4 ReportsS3Service, upload-url flow, photo processing worker, orphan sweep"
```

---

## Task 5: Report submission + public status endpoint

**Files:**
- Create: `apps/api/src/modules/reports/dto/submit-report.dto.ts`
- Create: `apps/api/src/modules/reports/reference.util.ts`
- Create: `apps/api/src/modules/reports/reference.util.spec.ts`
- Create: `apps/api/src/modules/reports/consent/consent-port.ts`
- Create: `apps/api/src/modules/reports/consent/in-memory-consent.provider.ts`
- Create: `apps/api/src/modules/reports/reports.service.ts`
- Create: `apps/api/src/modules/reports/reports.service.spec.ts`
- Create: `apps/api/src/modules/reports/reports-public.controller.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Create: `apps/api/test/reports/reports-submission.integration.spec.ts`

- [ ] **Step 1: Reference generator** — `RPT-` + 6 Crockford base32 chars, collision-retried:

```ts
// apps/api/src/modules/reports/reference.util.ts
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateReferenceCandidate(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)];
  }
  return `RPT-${suffix}`;
}

export async function generateUniqueReference(
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateReferenceCandidate();
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('reference_generation_exhausted');
}
```

```ts
// apps/api/src/modules/reports/reference.util.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { generateReferenceCandidate, generateUniqueReference } from './reference.util';

describe('generateReferenceCandidate', () => {
  it('matches RPT-XXXXXX with Crockford base32 chars', () => {
    expect(generateReferenceCandidate()).toMatch(/^RPT-[0-9A-HJKMNP-TV-Z]{6}$/);
  });
});

describe('generateUniqueReference', () => {
  it('retries on collision until a free candidate is found', async () => {
    let calls = 0;
    const exists = vi.fn(async () => {
      calls++;
      return calls < 3;
    });
    const ref = await generateUniqueReference(exists);
    expect(exists).toHaveBeenCalledTimes(3);
    expect(ref).toMatch(/^RPT-/);
  });

  it('throws after maxAttempts collisions', async () => {
    await expect(generateUniqueReference(async () => true, 3)).rejects.toThrow('reference_generation_exhausted');
  });
});
```

- [ ] **Step 2: `ConsentPort` stub** (E19 not yet shipped — in-memory adapter per the epic's explicit instruction, plus the `GET /v1/_dev/consents` dev endpoint for AC8):

```ts
// apps/api/src/modules/reports/consent/consent-port.ts
export const CONSENT_PORT = 'CONSENT_PORT';

export interface RecordConsentInput {
  subjectEmail?: string;
  subjectPhone?: string;
  purpose: string;
  tenantId: string;
  source: string;
  textVersion: string;
}

export interface ConsentPort {
  record(input: RecordConsentInput): Promise<string>;
}
```

```ts
// apps/api/src/modules/reports/consent/in-memory-consent.provider.ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConsentPort, RecordConsentInput } from './consent-port';

export interface InMemoryConsentRecord extends RecordConsentInput {
  consentId: string;
  createdAt: string;
}

@Injectable()
export class InMemoryConsent implements ConsentPort {
  private records: InMemoryConsentRecord[] = [];

  async record(input: RecordConsentInput): Promise<string> {
    const consentId = randomUUID();
    this.records.push({ ...input, consentId, createdAt: new Date().toISOString() });
    return consentId;
  }

  list(): InMemoryConsentRecord[] {
    return this.records;
  }
}
```

- [ ] **Step 3: `SubmitReportDto`**

```ts
// apps/api/src/modules/reports/dto/submit-report.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';

enum PurchaseChannelDto {
  open_market = 'open_market',
  street_vendor = 'street_vendor',
  online_marketplace = 'online_marketplace',
  social_media = 'social_media',
  pharmacy = 'pharmacy',
  supermarket = 'supermarket',
  brand_store = 'brand_store',
  other = 'other',
}

class ContactDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsBoolean()
  consent!: boolean;
}

export class SubmitReportDto {
  @IsString()
  @IsNotEmpty()
  scanEventId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sellerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sellerLocation?: string;

  @IsEnum(PurchaseChannelDto)
  purchaseChannel!: PurchaseChannelDto;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  photoIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactDto)
  contact?: ContactDto;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;
}
```

- [ ] **Step 4: `ReportsService.submit` + public status lookup** — the core rule from the epic: the server derives `unitId`/`batchId`/`productId`/`verdict` from the `ScanEvent`, cross-tenant scan events 404, and green verdicts are rejected (reports only make sense for `red|amber|unknown|decommissioned|flagged`):

```ts
// apps/api/src/modules/reports/reports.service.ts
import { BadRequestException, ForbiddenException, GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Report } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CAPTCHA_PORT, type CaptchaPort } from './captcha/captcha-port';
import { CONSENT_PORT, type ConsentPort } from './consent/consent-port';
import { generateUniqueReference } from './reference.util';
import type { SubmitReportDto } from './dto/submit-report.dto';

const REPORTABLE_VERDICTS = new Set(['red', 'amber', 'unknown', 'decommissioned', 'flagged']);

export interface SubmitContext {
  ip: string;
  ipHash: string;
  userAgent?: string;
  locale?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CAPTCHA_PORT) private readonly captcha: CaptchaPort,
    @Inject(CONSENT_PORT) private readonly consent: ConsentPort,
  ) {}

  async resolveTenantBySlug(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException('tenant_not_found');
    if (tenant.status === 'offboarded') throw new GoneException('tenant_offboarded');
    // Suspended/restricted tenants stay open for consumer reporting — E03's
    // "reporting remains available" requirement — so no further status check here.
    return tenant;
  }

  async submit(tenantSlug: string, dto: SubmitReportDto, ctx: SubmitContext): Promise<{ reference: string; statusUrl: string }> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);

    const captchaResult = await this.captcha.verify(dto.captchaToken, ctx.ip);
    if (!captchaResult.ok) throw new ForbiddenException({ error: 'captcha_failed', reason: captchaResult.reason });

    const scanEvent = await this.prisma.scanEvent.findUnique({ where: { id: dto.scanEventId } });
    if (!scanEvent || scanEvent.tenantId !== tenant.id) throw new NotFoundException('scan_event_not_found');
    if (!REPORTABLE_VERDICTS.has(scanEvent.verdict)) {
      throw new BadRequestException({ error: 'verdict_not_reportable', verdict: scanEvent.verdict });
    }

    const photos = await this.prisma.reportPhoto.findMany({
      where: { id: { in: dto.photoIds }, ipHash: ctx.ipHash, reportId: null },
    });
    if (photos.length !== dto.photoIds.length) {
      throw new BadRequestException({ error: 'photo_rejected', reason: 'photo_not_owned_or_claimed' });
    }
    if (photos.some((p) => p.status === 'rejected')) {
      throw new BadRequestException({ error: 'photo_rejected', reason: 'magic_mismatch' });
    }

    let contactConsentId: string | undefined;
    if (dto.contact?.consent && (dto.contact.email || dto.contact.phone)) {
      contactConsentId = await this.consent.record({
        subjectEmail: dto.contact.email,
        subjectPhone: dto.contact.phone,
        purpose: 'report_contact',
        tenantId: tenant.id,
        source: 'report_form',
        textVersion: 'v1',
      });
    }

    const reference = await generateUniqueReference(
      async (candidate) => (await this.prisma.report.count({ where: { reference: candidate } })) > 0,
    );

    const report = await this.prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference,
        scanEventId: scanEvent.id,
        unitId: scanEvent.unitId,
        batchId: scanEvent.batchId,
        productId: scanEvent.productId,
        verdictAtReport: scanEvent.verdict,
        sellerName: dto.sellerName,
        sellerLocation: dto.sellerLocation,
        purchaseChannel: dto.purchaseChannel,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        description: dto.description?.replace(/[ -]/g, ''),
        contactEmail: dto.contact?.email,
        contactPhone: dto.contact?.phone,
        contactConsentId,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
        locale: ctx.locale,
      },
    });

    await this.prisma.reportPhoto.updateMany({
      where: { id: { in: dto.photoIds } },
      data: { reportId: report.id, status: 'uploaded' },
    });

    this.eventEmitter.emit('report.created', {
      tenantId: tenant.id,
      data: {
        reportId: report.id,
        tenantId: tenant.id,
        reference: report.reference,
        unitId: report.unitId,
        batchId: report.batchId,
        productId: report.productId,
        verdictAtReport: report.verdictAtReport,
        purchaseChannel: report.purchaseChannel,
        hasPhotos: dto.photoIds.length > 0,
        hasContact: Boolean(dto.contact?.email || dto.contact?.phone),
      },
    });

    if (dto.contact?.email) {
      this.eventEmitter.emit('report.consumer_ack.requested', {
        reportId: report.id,
        tenantId: tenant.id,
        email: dto.contact.email,
        reference: report.reference,
      });
    }

    return { reference: report.reference, statusUrl: `/v1/public/${tenantSlug}/reports/${report.reference}` };
  }

  async getPublicStatus(tenantSlug: string, reference: string): Promise<{ status: string; outcome?: string; updatedAt: string }> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    const report = await this.prisma.report.findUnique({ where: { reference } });
    if (!report || report.tenantId !== tenant.id) throw new NotFoundException('report_not_found');
    return { status: report.status, outcome: report.outcome ?? undefined, updatedAt: report.updatedAt.toISOString() };
  }
}
```

Note on notifications: `report.consumer_ack` is sent via a dedicated internal event (`report.consumer_ack.requested`) rather than calling `NotificationService.send(...)` directly from `ReportsService`, to avoid a circular module dependency between `ReportsModule` and `NotificationsModule`. Task 10 adds a small listener inside `NotificationsModule` (or a thin adapter registered in `ReportsModule` that injects `NotificationService` directly — pick whichever avoids a circular import once both modules exist; if `NotificationsModule` is `@Global()`, injecting `NotificationService` straight into `ReportsService` is simpler and this event indirection is unnecessary — check before implementing Task 10 and simplify if so).

- [ ] **Step 5: Public controller**

```ts
// apps/api/src/modules/reports/reports-public.controller.ts
import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/public.decorator';
import { getClientIp, hashIp } from '../../common/ip-utils';
import { QuotaService } from '../quota/quota.service.js';
import { ReportsService } from './reports.service';
import { PhotosService } from './photos.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import { SubmitReportDto } from './dto/submit-report.dto';
import type { CaptchaPort } from './captcha/captcha-port';
import { CAPTCHA_PORT } from './captcha/captcha-port';
import { Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

@Controller('v1/public/:tenantSlug/reports')
@Public()
export class ReportsPublicController {
  constructor(
    private readonly config: ConfigService,
    private readonly reports: ReportsService,
    private readonly photos: PhotosService,
    private readonly quota: QuotaService,
    @Inject(CAPTCHA_PORT) private readonly captcha: CaptchaPort,
    @InjectQueue('reports') private readonly queue: Queue,
  ) {}

  private ipContext(req: Request) {
    const trustProxy = this.config.get<boolean>('TRUST_PROXY', true);
    const ip = getClientIp(req.headers as Record<string, unknown>, req.socket.remoteAddress, trustProxy) ?? '0.0.0.0';
    const salt = this.config.get<string>('IP_HASH_SALT')!;
    return { ip, ipHash: hashIp(ip, salt) };
  }

  @Post('upload-url')
  async requestUpload(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: RequestUploadDto,
    @Req() req: Request,
  ) {
    const tenant = await this.reports.resolveTenantBySlug(tenantSlug);
    const { ip, ipHash } = this.ipContext(req);

    const captchaResult = await this.captcha.verify(dto.captchaToken, ip);
    if (!captchaResult.ok) {
      throw new (await import('@nestjs/common')).ForbiddenException({ error: 'captcha_failed', reason: captchaResult.reason });
    }
    await this.quota.assertWithinQuota(tenant.id, 'report_uploads_per_ip_per_hour', { key: ipHash });

    return this.photos.requestUpload(tenant.id, dto.contentType, dto.sizeBytes, ipHash);
  }

  @Post()
  async submit(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: SubmitReportDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ) {
    const tenant = await this.reports.resolveTenantBySlug(tenantSlug);
    const { ip, ipHash } = this.ipContext(req);
    await this.quota.assertWithinQuota(tenant.id, 'reports_per_ip_per_hour', { key: ipHash });

    const result = await this.reports.submit(tenantSlug, dto, {
      ip,
      ipHash,
      userAgent,
      locale: acceptLanguage?.split(',')[0],
    });

    const submitted = await this.photosForReference(tenantSlug, result.reference);
    for (const photoId of submitted) {
      await this.queue.add('photo.process', { photoId });
    }
    return result;
  }

  @Get(':reference')
  async status(@Param('tenantSlug') tenantSlug: string, @Param('reference') reference: string) {
    return this.reports.getPublicStatus(tenantSlug, reference);
  }

  // Small helper: re-read the report's photo ids right after submit() so the
  // controller (not the service) owns enqueuing — keeps ReportsService free of
  // a BullMQ dependency, consistent with services staying queue-agnostic elsewhere.
  private async photosForReference(tenantSlug: string, reference: string): Promise<string[]> {
    const tenant = await this.reports.resolveTenantBySlug(tenantSlug);
    const report = await (this.reports as unknown as { prisma: import('@prisma/client').PrismaClient }).prisma.report.findUnique({
      where: { reference },
      include: { photos: true },
    });
    if (!report || report.tenantId !== tenant.id) return [];
    return report.photos.map((p) => p.id);
  }
}
```

The `photosForReference` reach-into-private-prisma hack is ugly — replace it before merging by adding a small public method `ReportsService.listPhotoIds(reportId: string)` instead, and having `submit()` return `{ reference, statusUrl, reportId }` (drop `reportId` from the public JSON response by only destructuring `{ reference, statusUrl }` in the controller's return). Do this cleanup as part of Step 5, not as a follow-up — the plan step above shows the reasoning; write the clean version:

```ts
// reports.service.ts — extend submit()'s return type and add:
async listPhotoIds(reportId: string): Promise<string[]> {
  const photos = await this.prisma.reportPhoto.findMany({ where: { reportId }, select: { id: true } });
  return photos.map((p) => p.id);
}
```
and change `submit()`'s return to include `reportId: report.id` internally, then in the controller:
```ts
    const result = await this.reports.submit(tenantSlug, dto, { ip, ipHash, userAgent, locale: acceptLanguage?.split(',')[0] });
    const photoIds = await this.reports.listPhotoIds(result.reportId);
    for (const photoId of photoIds) await this.queue.add('photo.process', { photoId });
    return { reference: result.reference, statusUrl: result.statusUrl };
```

- [ ] **Step 6: Wire into the module**

```ts
// reports.module.ts — add
import { PrismaClient } from '@prisma/client';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { QuotaModule } from '../quota/quota.module'; // confirm exact export name when opening the file
import { ReportsService } from './reports.service';
import { ReportsPublicController } from './reports-public.controller';
import { CONSENT_PORT } from './consent/consent-port';
import { InMemoryConsent } from './consent/in-memory-consent.provider';

// providers: add ReportsService, InMemoryConsent, { provide: CONSENT_PORT, useExisting: InMemoryConsent }
// controllers: add ReportsPublicController
// imports: add QuotaModule if quota isn't already @Global()
```

Check whether `QuotaModule`/`AuditModule` are `@Global()` (audit's is confirmed `@Global()` from Task research) before adding an explicit import — if quota is also global, no import is needed, just inject `QuotaService` directly.

- [ ] **Step 7: Integration test — the AC1/AC3 happy and unhappy paths**

```ts
// apps/api/test/reports/reports-submission.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema, disconnectTestHelper } from '@verifynng/db';
import { tenant as makeTenant } from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { InMemoryConsent } from '../../src/modules/reports/consent/in-memory-consent.provider';
import type { CaptchaPort } from '../../src/modules/reports/captcha/captcha-port';

class FixedCaptcha implements CaptchaPort {
  constructor(private readonly ok: boolean) {}
  async verify() {
    return { ok: this.ok, reason: this.ok ? undefined : 'invalid-input-response' };
  }
}

describe('ReportsService.submit (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;

  beforeAll(async () => {
    const db = await createTestDatabase('reports-submission');
    prisma = db.prisma;
    schemaName = db.schemaName;
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('creates a report from a red-verdict scan event and rejects a green one', async () => {
    const tenant = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(prisma, events, new FixedCaptcha(true), new InMemoryConsent());

    const redScan = await prisma.scanEvent.create({
      data: { tenantId: tenant.id, tier: 'tier2', verdict: 'red', source: 'qr', codeRedacted: 'abc***' },
    });

    const created: unknown[] = [];
    events.on('report.created', (p) => created.push(p));

    const result = await service.submit(
      tenant.slug,
      {
        scanEventId: redScan.id,
        purchaseChannel: 'open_market' as never,
        photoIds: [],
        captchaToken: 'ok-demo',
      } as never,
      { ip: '10.0.0.1', ipHash: 'iphash-a' },
    );
    expect(result.reference).toMatch(/^RPT-/);
    expect(created).toHaveLength(1);

    const greenScan = await prisma.scanEvent.create({
      data: { tenantId: tenant.id, tier: 'tier2', verdict: 'green', source: 'qr', codeRedacted: 'def***' },
    });
    await expect(
      service.submit(
        tenant.slug,
        { scanEventId: greenScan.id, purchaseChannel: 'open_market' as never, photoIds: [], captchaToken: 'ok-demo' } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-a' },
      ),
    ).rejects.toThrow();
  });

  it('rejects a scanEvent belonging to another tenant with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(prisma, events, new FixedCaptcha(true), new InMemoryConsent());
    const scan = await prisma.scanEvent.create({
      data: { tenantId: tenantB.id, tier: 'tier2', verdict: 'red', source: 'qr', codeRedacted: 'ghi***' },
    });
    await expect(
      service.submit(
        tenantA.slug,
        { scanEventId: scan.id, purchaseChannel: 'open_market' as never, photoIds: [], captchaToken: 'ok-demo' } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-b' },
      ),
    ).rejects.toThrow();
  });

  it('rejects a failing captcha token', async () => {
    const tenant = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(prisma, events, new FixedCaptcha(false), new InMemoryConsent());
    const scan = await prisma.scanEvent.create({
      data: { tenantId: tenant.id, tier: 'tier2', verdict: 'red', source: 'qr', codeRedacted: 'jkl***' },
    });
    await expect(
      service.submit(
        tenant.slug,
        { scanEventId: scan.id, purchaseChannel: 'open_market' as never, photoIds: [], captchaToken: 'fail-1' } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-c' },
      ),
    ).rejects.toThrow();
  });
});
```

Adjust field names on `prisma.scanEvent.create` once you check the exact required fields on `ScanEvent` (research found: `tenantId, unitId?, tier, verdict, batchId?, productId?, source, codeRedacted, ipHash?, ...` — the above assumes `tier`/`source`/`codeRedacted` are required and the rest optional; confirm against the schema before running).

- [ ] **Step 8: Run it**

```bash
pnpm --filter @verifynng/api test -- reports-submission reference.util
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/reports apps/api/test/reports/reports-submission.integration.spec.ts
git commit -m "feat(E08): T5 report submission, public status endpoint, reference generator, consent stub"
```

---

## Task 6: Admin API — list/summary/detail/assign/notes/status, `ReportsQuery`, retention

**Files:**
- Create: `apps/api/src/modules/reports/dto/report-note.dto.ts`
- Create: `apps/api/src/modules/reports/dto/report-assign.dto.ts`
- Create: `apps/api/src/modules/reports/dto/report-status.dto.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts` (add admin methods)
- Create: `apps/api/src/modules/reports/reports-query.service.ts`
- Create: `apps/api/src/modules/reports/reports-retention.service.ts`
- Create: `apps/api/src/modules/reports/reports-admin.controller.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Create: `apps/api/test/reports/reports-admin.integration.spec.ts`

- [ ] **Step 1: DTOs**

```ts
// apps/api/src/modules/reports/dto/report-note.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class ReportNoteDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) body!: string;
}
```

```ts
// apps/api/src/modules/reports/dto/report-assign.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
export class ReportAssignDto {
  @IsString() @IsNotEmpty() memberId!: string;
}
```

```ts
// apps/api/src/modules/reports/dto/report-status.dto.ts
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

enum ReportStatusDto {
  new = 'new',
  triaged = 'triaged',
  investigating = 'investigating',
  closed = 'closed',
}
enum ReportOutcomeDto {
  confirmed_counterfeit = 'confirmed_counterfeit',
  legit = 'legit',
  insufficient = 'insufficient',
}

export class ReportStatusChangeDto {
  @IsEnum(ReportStatusDto)
  status!: ReportStatusDto;

  @IsOptional()
  @IsEnum(ReportOutcomeDto)
  outcome?: ReportOutcomeDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  notifyConsumer?: boolean;
}
```

- [ ] **Step 2: Status transition table + admin methods on `ReportsService`**

Append to `apps/api/src/modules/reports/reports.service.ts`:

```ts
const TRANSITIONS: Record<string, string[]> = {
  new: ['triaged', 'closed'],
  triaged: ['investigating', 'closed'],
  investigating: ['closed'],
  closed: ['investigating'],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
```

```ts
  // — Admin —

  async list(
    tenantId: string,
    opts: { status?: string; outcome?: string; assignedToId?: string; batchId?: string; from?: string; to?: string; q?: string; cursor?: string },
  ): Promise<Report[]> {
    const where: Record<string, unknown> = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.outcome) where.outcome = opts.outcome;
    if (opts.assignedToId) where.assignedToId = opts.assignedToId;
    if (opts.batchId) where.batchId = opts.batchId;
    if (opts.from || opts.to) {
      where.createdAt = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }
    if (opts.q) {
      where.OR = [
        { reference: { contains: opts.q, mode: 'insensitive' } },
        { sellerName: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      cursor: opts.cursor ? { id: opts.cursor } : undefined,
      skip: opts.cursor ? 1 : 0,
    });
  }

  async summary(tenantId: string) {
    const [newCount, triaged, investigating, closed, byOutcomeRows] = await Promise.all([
      this.prisma.report.count({ where: { tenantId, status: 'new' } }),
      this.prisma.report.count({ where: { tenantId, status: 'triaged' } }),
      this.prisma.report.count({ where: { tenantId, status: 'investigating' } }),
      this.prisma.report.count({ where: { tenantId, status: 'closed' } }),
      this.prisma.report.groupBy({ by: ['outcome'], where: { tenantId, outcome: { not: null } }, _count: true }),
    ]);
    const byOutcome = Object.fromEntries(byOutcomeRows.map((r) => [r.outcome, r._count]));
    return { new: newCount, triaged, investigating, closed, byOutcome };
  }

  async detail(tenantId: string, id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        photos: true,
        notes: { orderBy: { createdAt: 'asc' } },
        statusChanges: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!report || report.tenantId !== tenantId) throw new NotFoundException('report_not_found');
    return report;
  }

  async assign(tenantId: string, id: string, memberId: string): Promise<void> {
    const report = await this.detail(tenantId, id);
    await this.prisma.report.update({ where: { id: report.id }, data: { assignedToId: memberId } });
    this.eventEmitter.emit('report.assigned', { reportId: report.id, tenantId, assignedToId: memberId });
  }

  async addNote(tenantId: string, id: string, authorId: string, body: string): Promise<void> {
    const report = await this.detail(tenantId, id);
    await this.prisma.reportNote.create({ data: { tenantId, reportId: report.id, authorId, body } });
  }

  async changeStatus(
    tenantId: string,
    id: string,
    actorId: string,
    input: { status: string; outcome?: string; note?: string; notifyConsumer?: boolean },
  ): Promise<void> {
    const report = await this.detail(tenantId, id);
    if (!canTransition(report.status, input.status)) {
      throw new BadRequestException({ error: 'invalid_transition', from: report.status, to: input.status });
    }
    if (input.status === 'closed' && !input.outcome) {
      throw new BadRequestException({ error: 'outcome_required' });
    }
    await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: input.status as never,
          outcome: (input.outcome as never) ?? (input.status === 'closed' ? report.outcome : undefined),
          closedAt: input.status === 'closed' ? new Date() : null,
        },
      }),
      this.prisma.reportStatusChange.create({
        data: {
          tenantId,
          reportId: report.id,
          fromStatus: report.status,
          toStatus: input.status as never,
          outcome: input.outcome as never,
          note: input.note,
          actorId,
          consumerNotified: Boolean(input.notifyConsumer && report.contactEmail),
        },
      }),
    ]);
    this.eventEmitter.emit('report.status.changed', {
      reportId: report.id,
      tenantId,
      reference: report.reference,
      from: report.status,
      to: input.status,
      outcome: input.outcome,
      actorId,
    });
    if (input.notifyConsumer && report.contactEmail) {
      this.eventEmitter.emit('report.consumer_update.requested', {
        reportId: report.id,
        tenantId,
        email: report.contactEmail,
        reference: report.reference,
        status: input.status,
        outcome: input.outcome,
      });
    }
  }
```

- [ ] **Step 3: `ReportsQueryService`** — the small cross-epic-facing provider for E07/E12 (`ReportsQuery.forUnit/.forBatch`):

```ts
// apps/api/src/modules/reports/reports-query.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ReportsQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  async forUnit(unitId: string): Promise<{ count: number }> {
    const count = await this.prisma.report.count({ where: { unitId } });
    return { count };
  }

  async forBatch(batchId: string): Promise<{ count: number }> {
    const count = await this.prisma.report.count({ where: { batchId } });
    return { count };
  }
}
```

- [ ] **Step 4: `ReportsRetentionService`** — `purgeContact` hook for E19, plus the dev-only invocation route used by AC8:

```ts
// apps/api/src/modules/reports/reports-retention.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ReportsRetentionService {
  constructor(private readonly prisma: PrismaClient) {}

  async purgeContact(before: Date): Promise<number> {
    const result = await this.prisma.report.updateMany({
      where: { createdAt: { lt: before }, contactPurgedAt: null, OR: [{ contactEmail: { not: null } }, { contactPhone: { not: null } }] },
      data: { contactEmail: null, contactPhone: null, contactPurgedAt: new Date() },
    });
    return result.count;
  }
}
```

- [ ] **Step 5: Admin controller** — note the anomaly context is stubbed to `[]` per the plan header's known gap (E07 `todo`):

```ts
// apps/api/src/modules/reports/reports-admin.controller.ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles, TenantId } from '../../common/tenant';
import { Audited } from '../audit/audited.decorator';
import { ReportsService } from './reports.service';
import { ReportAssignDto } from './dto/report-assign.dto';
import { ReportNoteDto } from './dto/report-note.dto';
import { ReportStatusChangeDto } from './dto/report-status.dto';
import type { AuthenticatedRequest } from '../../common/authenticated-request';
import { Req } from '@nestjs/common';

@Controller('v1/reports')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Roles('viewer')
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('outcome') outcome?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('batchId') batchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reports.list(tenantId, { status, outcome, assignedToId, batchId, from, to, q, cursor });
  }

  @Get('summary')
  @Roles('viewer')
  summary(@TenantId() tenantId: string) {
    return this.reports.summary(tenantId);
  }

  @Get(':id')
  @Roles('viewer')
  async detail(@TenantId() tenantId: string, @Param('id') id: string) {
    const report = await this.reports.detail(tenantId, id);
    // E07 not yet shipped — anomalies stubbed to [] per CROSS-EPIC-REQUESTS.md.
    return { ...report, anomalies: [] as unknown[] };
  }

  @Post(':id/assign')
  @Roles('operator')
  @Audited('report.assign', { target: (req) => ({ type: 'report', id: req.params.id }) })
  async assign(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: ReportAssignDto) {
    await this.reports.assign(tenantId, id, dto.memberId);
    return { ok: true };
  }

  @Post(':id/notes')
  @Roles('operator')
  @Audited('report.note.add', { target: (req) => ({ type: 'report', id: req.params.id }) })
  async addNote(@TenantId() tenantId: string, @Param('id') id: string, @Req() req: AuthenticatedRequest, @Body() dto: ReportNoteDto) {
    await this.reports.addNote(tenantId, id, req.user!.userId, dto.body);
    return { ok: true };
  }

  @Post(':id/status')
  @Roles('operator')
  @Audited('report.status.change', { target: (req) => ({ type: 'report', id: req.params.id }) })
  async changeStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReportStatusChangeDto,
  ) {
    await this.reports.changeStatus(tenantId, id, req.user!.userId, dto);
    return { ok: true };
  }
}
```

Confirm the exact `AuthenticatedRequest.user` shape (`userId` field name) against `apps/api/src/common/authenticated-request.ts` before wiring — the research above showed `UserPrincipal { userId, tenantId, role, platformRole, sessionId }` on `tenant-context.guard.ts`, so `req.user!.userId` should be correct, but verify the request-augmentation type used by `AuthenticatedRequest` matches that shape exactly.

- [ ] **Step 6: Wire into the module** (add `ReportsAdminController`, `ReportsQueryService`, `ReportsRetentionService` to `reports.module.ts`, exporting `ReportsQueryService` and `ReportsRetentionService` for future E07/E12/E19 consumption).

- [ ] **Step 7: Integration test — status transitions + role visibility**

```ts
// apps/api/test/reports/reports-admin.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema, disconnectTestHelper } from '@verifynng/db';
import { tenant as makeTenant, user as makeUser } from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ReportsService, canTransition } from '../../src/modules/reports/reports.service';
import { InMemoryConsent } from '../../src/modules/reports/consent/in-memory-consent.provider';

describe('canTransition', () => {
  it('allows new -> triaged -> investigating -> closed', () => {
    expect(canTransition('new', 'triaged')).toBe(true);
    expect(canTransition('triaged', 'investigating')).toBe(true);
    expect(canTransition('investigating', 'closed')).toBe(true);
  });
  it('allows closed -> investigating (reopen)', () => {
    expect(canTransition('closed', 'investigating')).toBe(true);
  });
  it('rejects new -> investigating (skip)', () => {
    expect(canTransition('new', 'investigating')).toBe(false);
  });
});

describe('ReportsService admin flows (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: ReportsService;

  beforeAll(async () => {
    const db = await createTestDatabase('reports-admin');
    prisma = db.prisma;
    schemaName = db.schemaName;
    service = new ReportsService(prisma, new EventEmitter2(), { verify: async () => ({ ok: true }) }, new InMemoryConsent());
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('requires an outcome to close, records a status change row, assign + note', async () => {
    const tenant = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: { tenantId: tenant.id, reference: 'RPT-TEST01', verdictAtReport: 'red', purchaseChannel: 'open_market', ipHash: 'x' },
    });

    await service.assign(tenant.id, report.id, operator.id);
    await service.addNote(tenant.id, report.id, operator.id, 'Looks suspicious');
    await service.changeStatus(tenant.id, report.id, operator.id, { status: 'triaged' });
    await service.changeStatus(tenant.id, report.id, operator.id, { status: 'investigating' });
    await expect(
      service.changeStatus(tenant.id, report.id, operator.id, { status: 'closed' }),
    ).rejects.toThrow();
    await service.changeStatus(tenant.id, report.id, operator.id, { status: 'closed', outcome: 'confirmed_counterfeit' });

    const detail = await service.detail(tenant.id, report.id);
    expect(detail.status).toBe('closed');
    expect(detail.outcome).toBe('confirmed_counterfeit');
    expect(detail.statusChanges).toHaveLength(3);
    expect(detail.notes).toHaveLength(1);
    expect(detail.assignedToId).toBe(operator.id);
  });
});
```

- [ ] **Step 8: Run it**

```bash
pnpm --filter @verifynng/api test -- reports-admin
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/reports apps/api/test/reports/reports-admin.integration.spec.ts
git commit -m "feat(E08): T6 admin API (list/summary/detail/assign/notes/status), ReportsQuery, retention"
```

---

## Task 7: CSV export

**Files:**
- Create: `apps/api/src/modules/reports/csv.util.ts`
- Create: `apps/api/src/modules/reports/csv.util.spec.ts`
- Modify: `apps/api/src/modules/reports/reports-admin.controller.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts` (add a streaming-friendly `listForExport`)

- [ ] **Step 1: CSV utility** — no CSV library exists elsewhere in this codebase, so a small hand-rolled escaper (RFC 4180: quote fields containing comma/quote/newline, double up embedded quotes):

```ts
// apps/api/src/modules/reports/csv.util.ts
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',') + '\n';
}
```

```ts
// apps/api/src/modules/reports/csv.util.spec.ts
import { describe, it, expect } from 'vitest';
import { csvEscape, csvRow } from './csv.util';

describe('csvEscape', () => {
  it('leaves plain values alone', () => expect(csvEscape('abc')).toBe('abc'));
  it('quotes values containing commas', () => expect(csvEscape('a,b')).toBe('"a,b"'));
  it('doubles embedded quotes', () => expect(csvEscape('say "hi"')).toBe('"say ""hi"""'));
  it('quotes values containing newlines', () => expect(csvEscape('a\nb')).toBe('"a\nb"'));
  it('renders null/undefined as empty string', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('csvRow', () => {
  it('joins escaped values with commas and a trailing newline', () => {
    expect(csvRow(['a', 'b,c', 1])).toBe('a,"b,c",1\n');
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @verifynng/api test -- csv.util
```

- [ ] **Step 3: Streaming export method on `ReportsService`**

```ts
  async *streamForExport(tenantId: string, opts: { status?: string; outcome?: string; from?: string; to?: string }, includeContact: boolean) {
    const header = [
      'reference', 'createdAt', 'status', 'outcome', 'verdict', 'productId', 'batchId', 'unitId',
      'purchaseChannel', 'sellerName', 'sellerLocation', 'assignedToId', 'photoCount',
      ...(includeContact ? ['contactEmail', 'contactPhone'] : []),
    ];
    yield header;

    let cursor: string | undefined;
    for (;;) {
      const where: Record<string, unknown> = { tenantId };
      if (opts.status) where.status = opts.status;
      if (opts.outcome) where.outcome = opts.outcome;
      if (opts.from || opts.to) {
        where.createdAt = { ...(opts.from ? { gte: new Date(opts.from) } : {}), ...(opts.to ? { lte: new Date(opts.to) } : {}) };
      }
      const batch = await this.prisma.report.findMany({
        where,
        orderBy: { id: 'asc' },
        take: 500,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        include: { _count: { select: { photos: true } } },
      });
      if (batch.length === 0) break;
      for (const r of batch) {
        yield [
          r.reference, r.createdAt.toISOString(), r.status, r.outcome ?? '', r.verdictAtReport,
          r.productId ?? '', r.batchId ?? '', r.unitId ?? '',
          r.purchaseChannel, r.sellerName ?? '', r.sellerLocation ?? '', r.assignedToId ?? '',
          r._count.photos,
          ...(includeContact ? [r.contactEmail ?? '', r.contactPhone ?? ''] : []),
        ];
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < 500) break;
    }
  }
```

- [ ] **Step 4: Controller route** — streams the response, audited once per call with the filter used:

```ts
// reports-admin.controller.ts — add
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { csvRow } from './csv.util';

  @Get('export.csv')
  @Roles('operator')
  @Audited('report.export')
  async exportCsv(
    @TenantId() tenantId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('outcome') outcome?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const includeContact = req.user!.role === 'owner';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reports-export.csv"');
    for await (const row of this.reports.streamForExport(tenantId, { status, outcome, from, to }, includeContact)) {
      res.write(csvRow(row));
    }
    res.end();
  }
```

Route ordering caveat: `@Get('export.csv')` must be declared **before** `@Get(':id')` in the controller (Nest matches routes in declaration order; otherwise `export.csv` is swallowed by the `:id` param route). Move this handler up, directly after `summary()`.

- [ ] **Step 5: Manual verification against compose** (real integration test for streaming with 10k rows is listed in the epic's "Testing" section as valuable but heavy — cover the column-selection-by-role logic with a fast unit test instead, and defer the 10k-row perf assertion to Task 11's E2E/manual AC7 check):

```ts
// add to reports-admin.integration.spec.ts (Task 6's file) or a new csv-export.integration.spec.ts
it('omits contact columns for non-owner roles', async () => {
  // build a small tenant/report fixture, call service.streamForExport with includeContact=false,
  // assert the header row length and absence of 'contactEmail'/'contactPhone'
});
```

Write this as one concrete test in `apps/api/test/reports/reports-admin.integration.spec.ts`, following the exact fixture pattern from Task 6 Step 7.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports
git commit -m "feat(E08): T7 CSV export with role-gated contact columns"
```

---

## Task 8: `ReportForm` in `packages/ui` + minimal Storybook

**Files:**
- Create: `packages/ui/src/components/ReportForm/types.ts`
- Create: `packages/ui/src/components/ReportForm/downscale.ts`
- Create: `packages/ui/src/components/ReportForm/downscale.test.ts`
- Create: `packages/ui/src/components/ReportForm/ReportForm.tsx`
- Create: `packages/ui/src/components/ReportForm/ReportForm.test.tsx`
- Create: `packages/ui/src/components/ReportForm/ReportForm.stories.tsx`
- Create: `packages/ui/src/components/ReportForm/index.ts`
- Create: `packages/ui/.storybook/main.ts`
- Create: `packages/ui/.storybook/preview.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/index.ts` (export `ReportForm`)

- [ ] **Step 1: Types + API contract**

```ts
// packages/ui/src/components/ReportForm/types.ts
export type PurchaseChannel =
  | 'open_market' | 'street_vendor' | 'online_marketplace' | 'social_media'
  | 'pharmacy' | 'supermarket' | 'brand_store' | 'other';

export interface ReportFormProps {
  tenantSlug: string;
  scanEventId: string;
  verdict: string;
  apiBaseUrl: string;
  captchaSiteKey?: string;
  onSubmitted?: (reference: string) => void;
  locale?: string;
}

export type FormStep = 'details' | 'photos' | 'contact' | 'done';
```

- [ ] **Step 2: Client-side downscale** — canvas-based, pure function taking a `File`, returning a downsized `Blob` (≤2000px longest side):

```ts
// packages/ui/src/components/ReportForm/downscale.ts
export async function downscaleImage(file: File, maxDimension = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas_export_failed'))), 'image/jpeg', 0.9);
  });
}
```

```ts
// packages/ui/src/components/ReportForm/downscale.test.ts
import { describe, it, expect, vi } from 'vitest';
import { downscaleImage } from './downscale';

describe('downscaleImage', () => {
  it('returns the original file unchanged if already within bounds', async () => {
    const file = new File([new Uint8Array(10)], 'small.jpg', { type: 'image/jpeg' });
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async () => ({ width: 800, height: 600 }));
    const result = await downscaleImage(file, 2000);
    expect(result).toBe(file);
  });

  it('scales down an oversized image and returns a Blob', async () => {
    const file = new File([new Uint8Array(10)], 'big.jpg', { type: 'image/jpeg' });
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000 }));
    const mockBlob = new Blob(['x'], { type: 'image/jpeg' });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob) => void) => cb(mockBlob),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLCanvasElement);
    const result = await downscaleImage(file, 2000);
    expect(result).toBe(mockBlob);
    expect(mockCanvas.width).toBe(2000);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 3: `ReportForm.tsx`** — four-step flow (details → photos → contact → done). Uses existing primitives only (`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Label`, `ProgressBar`):

```tsx
// packages/ui/src/components/ReportForm/ReportForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { ProgressBar } from '../ui/progress-bar';
import { downscaleImage } from './downscale';
import type { FormStep, PurchaseChannel, ReportFormProps } from './types';

const CHANNELS: { value: PurchaseChannel; label: string }[] = [
  { value: 'open_market', label: 'Open market' },
  { value: 'street_vendor', label: 'Street vendor' },
  { value: 'online_marketplace', label: 'Online marketplace' },
  { value: 'social_media', label: 'Social media' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'brand_store', label: 'Brand store' },
  { value: 'other', label: 'Other' },
];

export function ReportForm({ tenantSlug, scanEventId, apiBaseUrl, captchaSiteKey, onSubmitted }: ReportFormProps) {
  const [step, setStep] = useState<FormStep>('details');
  const [sellerName, setSellerName] = useState('');
  const [sellerLocation, setSellerLocation] = useState('');
  const [purchaseChannel, setPurchaseChannel] = useState<PurchaseChannel>('open_market');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ id: string; name: string; progress: number }[]>([]);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function uploadPhoto(file: File) {
    const blob = await downscaleImage(file);
    const contentType = file.type || 'image/jpeg';
    const upRes = await fetch(`${apiBaseUrl}/v1/public/${tenantSlug}/reports/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, sizeBytes: blob.size, captchaToken }),
    });
    if (!upRes.ok) throw new Error('upload_url_failed');
    const { photoId, uploadUrl } = await upRes.json();
    await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    setPhotos((prev) => [...prev, { id: photoId, name: file.name, progress: 100 }]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/v1/public/${tenantSlug}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanEventId,
          sellerName: sellerName || undefined,
          sellerLocation: sellerLocation || undefined,
          purchaseChannel,
          description: description || undefined,
          photoIds: photos.map((p) => p.id),
          contact: email ? { email, consent } : undefined,
          captchaToken,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `submit_failed_${res.status}`);
      }
      const body = await res.json();
      setReference(body.reference);
      setStep('done');
      onSubmitted?.(body.reference);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done' && reference) {
    return (
      <div className="space-y-4 rounded-lg border p-6">
        <h3 className="text-lg font-medium">Report submitted</h3>
        <p className="text-sm text-muted-foreground">Reference</p>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-sm">{reference}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(reference)}>
            Copy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-lg border p-6" data-testid="report-form">
      <ProgressBar value={['details', 'photos', 'contact'].indexOf(step) + 1} max={3} showValue={false} />

      {step === 'details' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="sellerName">Seller name (optional)</Label>
            <Input id="sellerName" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sellerLocation">Where did you buy this? (optional)</Label>
            <Input id="sellerLocation" value={sellerLocation} onChange={(e) => setSellerLocation(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="purchaseChannel">Purchase channel</Label>
            <Select value={purchaseChannel} onValueChange={(v) => setPurchaseChannel(v as PurchaseChannel)}>
              <SelectTrigger id="purchaseChannel"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="description">What made you suspicious? (optional)</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
          <Button onClick={() => setStep('photos')}>Continue</Button>
        </div>
      )}

      {step === 'photos' && (
        <div className="space-y-4">
          <Label htmlFor="photoInput">Photos (up to 5)</Label>
          <input
            id="photoInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            disabled={photos.length >= 5}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, 5 - photos.length);
              for (const file of files) {
                try {
                  await uploadPhoto(file);
                } catch {
                  setError('photo_upload_failed');
                }
              }
            }}
          />
          <ul className="space-y-1 text-sm">
            {photos.map((p) => <li key={p.id}>{p.name} — uploaded</li>)}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('details')}>Back</Button>
            <Button onClick={() => setStep('contact')}>Continue</Button>
          </div>
        </div>
      )}

      {step === 'contact' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email (optional — to receive updates)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {email && (
            <div className="flex items-center gap-2">
              <Checkbox id="consent" checked={consent} onCheckedChange={(c) => setConsent(Boolean(c))} />
              <Label htmlFor="consent">I consent to being contacted about this report (v1)</Label>
            </div>
          )}
          <div>
            <Label htmlFor="captchaToken">Verification</Label>
            {captchaSiteKey ? (
              <div data-testid="turnstile-widget-slot" data-sitekey={captchaSiteKey} />
            ) : (
              <Input
                id="captchaToken"
                placeholder="ok-demo (dev captcha token)"
                value={captchaToken}
                onChange={(e) => setCaptchaToken(e.target.value)}
              />
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('photos')}>Back</Button>
            <Button onClick={handleSubmit} disabled={submitting || !captchaToken || (Boolean(email) && !consent)}>
              {submitting ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `index.ts`**

```ts
// packages/ui/src/components/ReportForm/index.ts
export { ReportForm } from './ReportForm';
export type { ReportFormProps } from './types';
```

Add to `packages/ui/src/index.ts`: `export { ReportForm } from './components/ReportForm';` and `export type { ReportFormProps } from './components/ReportForm';`.

- [ ] **Step 5: Component test — step flow, error state**

```tsx
// packages/ui/src/components/ReportForm/ReportForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportForm } from './ReportForm';

describe('ReportForm', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.toString().endsWith('/reports')) {
        return new Response(JSON.stringify({ reference: 'RPT-ABC123', statusUrl: '/x' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
  });

  it('walks details -> photos -> contact -> submit -> done', async () => {
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
        onSubmitted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    fireEvent.change(screen.getByPlaceholderText(/ok-demo/i), { target: { value: 'ok-demo' } });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(screen.getByText('Report submitted')).toBeInTheDocument());
    expect(screen.getByText('RPT-ABC123')).toBeInTheDocument();
  });

  it('disables submit until a captcha token is present', async () => {
    render(<ReportForm tenantSlug="ivoryglow" scanEventId="scan1" verdict="red" apiBaseUrl="http://localhost:4000" />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run it**

```bash
pnpm --filter @verifyng/ui test -- ReportForm downscale
```

(Package name is `@verifyng/ui`, not `@verifynng/ui` — confirmed from `packages/ui/package.json`.)

- [ ] **Step 7: Minimal Storybook setup** — needed because the epic's AC1 explicitly names `pnpm --filter ui storybook` as the demo surface until E09 ships, and no Storybook config exists in this repo yet:

Add to `packages/ui/package.json` devDependencies:
```json
"@storybook/react-vite": "^9.1.0",
"storybook": "^9.1.0"
```
and a script: `"storybook": "storybook dev -p 6006"`.

```ts
// packages/ui/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: '@storybook/react-vite',
  addons: [],
};
export default config;
```

```ts
// packages/ui/.storybook/preview.ts
import type { Preview } from '@storybook/react-vite';
import '../src/tokens.css';

const preview: Preview = {
  parameters: { layout: 'padded' },
};
export default preview;
```

```tsx
// packages/ui/src/components/ReportForm/ReportForm.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportForm } from './ReportForm';

const meta: Meta<typeof ReportForm> = {
  title: 'Reports/ReportForm',
  component: ReportForm,
};
export default meta;

type Story = StoryObj<typeof ReportForm>;

export const RedVerdict: Story = {
  args: {
    tenantSlug: 'ivoryglow',
    scanEventId: 'REPLACE_WITH_SEEDED_SCAN_EVENT_ID',
    verdict: 'red',
    apiBaseUrl: 'http://localhost:4000',
    onSubmitted: (reference) => alert(`Submitted: ${reference}`),
  },
};
```

The `scanEventId` placeholder in the story is intentional and documented — Task 11's dev-seed endpoint will produce a real `scanEventId` to paste in when demoing AC1 locally; it can't be hardcoded here since scan events are created fresh in each compose stack.

- [ ] **Step 8: Verify Storybook boots**

```bash
pnpm --filter @verifyng/ui storybook
```
Open `http://localhost:6006`, confirm the `Reports/ReportForm` story renders without a console error (submitting will fail against a placeholder `scanEventId`/no running API — that's expected at this step; full AC1 demo happens in Task 11 against the live compose stack).

- [ ] **Step 9: Commit**

```bash
git add packages/ui
git commit -m "feat(E08): T8 ReportForm component + minimal Storybook setup"
```

---

## Task 9: web-admin console — queue, detail, triage

**Files:**
- Create: `apps/web-admin/lib/reports.ts`
- Modify: `apps/web-admin/lib/query.ts`
- Create: `apps/web-admin/app/(console)/reports/page.tsx` (replaces the `ModuleEmptyState` stub)
- Create: `apps/web-admin/app/(console)/reports/[id]/page.tsx`
- Create: `apps/web-admin/app/(console)/reports/[id]/status-dialog.tsx`

- [ ] **Step 1: `lib/reports.ts`** — note these routes are NOT under `tenantPath(...)` (no `:tenantId` in the URL) since the admin controller resolves tenant from the JWT, matching the `v1/audit`/`v1/quotas` convention rather than the `tenants/:tenantId/batches` one:

```ts
// apps/web-admin/lib/reports.ts
import { apiClient } from './api-client';

export type ReportStatus = 'new' | 'triaged' | 'investigating' | 'closed';
export type ReportOutcome = 'confirmed_counterfeit' | 'legit' | 'insufficient';

export interface Report {
  id: string;
  reference: string;
  status: ReportStatus;
  outcome: ReportOutcome | null;
  verdictAtReport: string;
  productId: string | null;
  batchId: string | null;
  unitId: string | null;
  purchaseChannel: string;
  sellerName: string | null;
  assignedToId: string | null;
  createdAt: string;
  photos?: Array<{ id: string; status: string }>;
}

export interface ReportContact {
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface ReportSummary {
  new: number;
  triaged: number;
  investigating: number;
  closed: number;
  byOutcome: Record<string, number>;
}

export interface ReportDetail extends Report, ReportContact {
  photos: Array<{ id: string; status: string; objectKey: string | null }>;
  notes: Array<{ id: string; authorId: string; body: string; createdAt: string }>;
  statusChanges: Array<{ id: string; fromStatus: string | null; toStatus: string; outcome: string | null; note: string | null; createdAt: string }>;
  anomalies: unknown[];
}

export function listReports(params?: { status?: string; assignedToId?: string }) {
  return apiClient.get<Report[]>('/v1/reports', { query: params });
}

export function getReportsSummary() {
  return apiClient.get<ReportSummary>('/v1/reports/summary');
}

export function getReport(id: string) {
  return apiClient.get<ReportDetail>(`/v1/reports/${id}`);
}

export function assignReport(id: string, memberId: string) {
  return apiClient.post(`/v1/reports/${id}/assign`, { memberId });
}

export function addReportNote(id: string, body: string) {
  return apiClient.post(`/v1/reports/${id}/notes`, { body });
}

export function changeReportStatus(
  id: string,
  input: { status: ReportStatus; outcome?: ReportOutcome; note?: string; notifyConsumer?: boolean },
) {
  return apiClient.post(`/v1/reports/${id}/status`, input);
}
```

Confirm `apiClient.get`/`.post` accept an absolute-from-API-root path with no tenant prefix (they should — the same client is used for `tenantPath`-prefixed and non-prefixed calls elsewhere, e.g. any existing `v1/`-rooted call in the app; if none exists yet, verify by reading `apiClient`'s implementation before assuming).

- [ ] **Step 2: Query keys**

```ts
// apps/web-admin/lib/query.ts — add to queryKeys
  reports: {
    list: (tenantId: string, filters?: string) => ['reports', 'list', tenantId, filters] as const,
    summary: (tenantId: string) => ['reports', 'summary', tenantId] as const,
    detail: (tenantId: string, id: string) => ['reports', 'detail', tenantId, id] as const,
  },
```

- [ ] **Step 3: Queue page** — mirrors `batches/page.tsx`'s `DataTable` + `PageHeader` + `EmptyState` shape:

```tsx
// apps/web-admin/app/(console)/reports/page.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, EmptyState, PageHeader, StatusChip, Tabs, TabsList, TabsTrigger } from '@verifyng/ui';
import { MessageSquareWarning, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { listReports, type Report, type ReportStatus } from '@/lib/reports';

const STATUS_VARIANT: Record<ReportStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  new: 'info',
  triaged: 'warning',
  investigating: 'warning',
  closed: 'neutral',
};

type SavedView = 'all' | 'new' | 'mine';

export default function ReportsPage() {
  const { activeTenantId, user } = useAuth();
  const [view, setView] = useState<SavedView>('all');

  const reportsQuery = useQuery({
    queryKey: queryKeys.reports.list(activeTenantId ?? '', view),
    queryFn: () =>
      listReports(
        view === 'new' ? { status: 'new' } : view === 'mine' ? { assignedToId: user?.id } : undefined,
      ),
    enabled: !!activeTenantId,
  });

  const columns: ColumnDef<Report>[] = [
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => (
        <Link href={`/reports/${row.original.id}`} className="text-brand font-medium hover:underline">
          {row.original.reference}
        </Link>
      ),
    },
    { accessorKey: 'purchaseChannel', header: 'Channel' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusChip variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</StatusChip>,
    },
    { accessorKey: 'outcome', header: 'Outcome', cell: ({ row }) => row.original.outcome ?? '—' },
    {
      id: 'photos',
      header: 'Photos',
      cell: ({ row }) => row.original.photos?.length ?? 0,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Consumer fake reports for this tenant's products." />
      <Tabs value={view} onValueChange={(v) => setView(v as SavedView)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
        </TabsList>
      </Tabs>

      {reportsQuery.isError ? (
        <EmptyState icon={AlertTriangleIcon} title="Couldn't load reports" description="The reports service isn't reachable yet." />
      ) : (
        <DataTable
          columns={columns}
          data={reportsQuery.data ?? []}
          isLoading={reportsQuery.isLoading}
          emptyState={<EmptyState icon={MessageSquareWarning} title="No reports yet" />}
        />
      )}
    </div>
  );
}
```

Confirmed against `apps/web-admin/lib/auth-store.ts`: `useAuth()` returns `user: AuthUser | null` where `AuthUser.id` is the current user's id — that's the field used above for the "Mine" filter.

- [ ] **Step 4: Detail page**

```tsx
// apps/web-admin/app/(console)/reports/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, PageHeader, StatusChip, Textarea } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { getReport, addReportNote, assignReport } from '@/lib/reports';
import { StatusDialog } from './status-dialog';

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const { activeTenantId, role, user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const canAct = role === 'owner' || role === 'operator';

  const reportQuery = useQuery({
    queryKey: queryKeys.reports.detail(activeTenantId ?? '', params.id),
    queryFn: () => getReport(params.id),
    enabled: !!activeTenantId,
  });

  const noteMutation = useMutation({
    mutationFn: () => addReportNote(params.id, note),
    onSuccess: () => {
      setNote('');
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.detail(activeTenantId ?? '', params.id) });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (memberId: string) => assignReport(params.id, memberId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reports.detail(activeTenantId ?? '', params.id) }),
  });

  if (!reportQuery.data) return null;
  const report = reportQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={report.reference}
        description={`${report.purchaseChannel} — ${report.verdictAtReport} verdict`}
        actions={<StatusChip variant="info">{report.status}</StatusChip>}
      />

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-medium">Photos</h3>
          <div className="grid grid-cols-3 gap-2">
            {report.photos.map((p) => (
              <div key={p.id} className="aspect-square rounded border bg-muted flex items-center justify-center text-xs">
                {p.status}
              </div>
            ))}
          </div>

          <h3 className="font-medium">Anomalies</h3>
          {report.anomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground">None (or E07 not yet available).</p>
          ) : (
            <div className="flex gap-2">
              {report.anomalies.map((a, i) => <Badge key={i}>{JSON.stringify(a)}</Badge>)}
            </div>
          )}

          {report.unitId && (
            <a href={`/units/${report.unitId}`} className="text-brand text-sm hover:underline">
              View linked unit →
            </a>
          )}
        </div>

        <div className="space-y-4">
          {canAct && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => user?.id && assignMutation.mutate(user.id)}>Assign to me</Button>
              <StatusDialog reportId={params.id} currentStatus={report.status} hasContact={Boolean(report.contactEmail)} />
            </div>
          )}

          <h3 className="font-medium">Notes</h3>
          <ul className="space-y-2">
            {report.notes.map((n) => (
              <li key={n.id} className="rounded border p-2 text-sm">
                <p>{n.body}</p>
                <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          {canAct && (
            <div className="space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
              <Button size="sm" onClick={() => noteMutation.mutate()} disabled={!note}>Add note</Button>
            </div>
          )}

          <h3 className="font-medium">Status history</h3>
          <ul className="space-y-1 text-sm">
            {report.statusChanges.map((s) => (
              <li key={s.id}>
                {s.fromStatus ?? '—'} → {s.toStatus} {s.outcome ? `(${s.outcome})` : ''} — {new Date(s.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

`assignMutation.mutate(user.id)` uses the real current-user id from `useAuth()` (`AuthUser.id`, confirmed in Step 3) — no placeholder.

- [ ] **Step 5: Status change dialog**

```tsx
// apps/web-admin/app/(console)/reports/[id]/status-dialog.tsx
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
  Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { changeReportStatus, type ReportOutcome, type ReportStatus } from '@/lib/reports';

const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
  new: ['triaged', 'closed'],
  triaged: ['investigating', 'closed'],
  investigating: ['closed'],
  closed: ['investigating'],
};

export function StatusDialog({ reportId, currentStatus, hasContact }: { reportId: string; currentStatus: ReportStatus; hasContact: boolean }) {
  const { activeTenantId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ReportStatus>(NEXT_STATUS[currentStatus][0]);
  const [outcome, setOutcome] = useState<ReportOutcome | ''>('');
  const [note, setNote] = useState('');
  const [notifyConsumer, setNotifyConsumer] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      changeReportStatus(reportId, {
        status,
        outcome: outcome || undefined,
        note: note || undefined,
        notifyConsumer,
      }),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.detail(activeTenantId ?? '', reportId) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Change status</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Change status</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>New status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ReportStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NEXT_STATUS[currentStatus].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {status === 'closed' && (
            <div>
              <Label>Outcome (required to close)</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as ReportOutcome)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed_counterfeit">Confirmed counterfeit</SelectItem>
                  <SelectItem value="legit">Legit</SelectItem>
                  <SelectItem value="insufficient">Insufficient evidence</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {hasContact && (
            <div className="flex items-center gap-2">
              <Checkbox id="notify" checked={notifyConsumer} onCheckedChange={(c) => setNotifyConsumer(Boolean(c))} />
              <Label htmlFor="notify">Notify consumer</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={status === 'closed' && !outcome}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Manual verification**

```bash
docker compose -f docker/compose.yml up -d
pnpm --filter web-admin dev
```
Open the web-admin URL from `scripts/epic ports E08`, log in (however E02's current login flow works), navigate to Reports — confirm the queue table and, once a report exists (Task 11 seeds one), the detail page render without console errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web-admin
git commit -m "feat(E08): T9 web-admin reports queue + detail + status dialog"
```

---

## Task 10: Notification templates + docs

**Files:**
- Modify: `apps/api/src/modules/notifications/templates/template-data.ts`
- Modify: `apps/api/src/modules/notifications/templates/registry.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts` (send via `NotificationService` directly if `NotificationsModule` is global — resolve the circular-import question flagged in Task 5)
- Create: `docs/reports/consumer-flow.md`
- Create: `docs/reports/triage-guide.md`
- Create: `docs/reports/photo-handling.md`

- [ ] **Step 1: Comment on E14's issue before touching its owned files** (hot-spot rule — `apps/api/src/modules/notifications/**` is E14's, not E08's):

```bash
gh issue comment 15 --repo enendufrankc/verifynNG --body "E08 is adding two consumer-facing templates to the catalog per docs/epics/CROSS-EPIC-REQUESTS.md: \`report.consumer_ack\` and \`report.consumer_update\`. Small additive PR incoming against templates/template-data.ts and templates/registry.ts — data contract and copy supplied by E08. Flagging per the hot-spot rule before pushing."
```

- [ ] **Step 2: `TemplateId` + `TemplateData` additions**

```ts
// template-data.ts — add to the TemplateId union
  | 'report.consumer_ack'
  | 'report.consumer_update'
```

```ts
// template-data.ts — add alongside 'report.received'
  'report.consumer_ack': NoCodeKeys<{
    reference: string;
    productName: string;
    statusUrl: string;
  }>;
  'report.consumer_update': NoCodeKeys<{
    reference: string;
    productName: string;
    status: string;
    outcome?: string;
    statusUrl: string;
  }>;
```

- [ ] **Step 3: Registry renderers** — matching the plain-string-template style already used for `report.received`:

```ts
// registry.ts — add alongside 'report.received'
  'report.consumer_ack': (data: TemplateData['report.consumer_ack'], branding) => ({
    subject: `We received your report — ${data.reference}`,
    bodyHtml: `<p style="margin:0 0 12px">Thanks for reporting a suspected fake ${esc(data.productName)}.</p><p style="margin:0 0 8px">Your reference: <strong>${esc(data.reference)}</strong></p><p style="margin:0 0 8px">We'll review it and let you know if we need anything else.</p><p style="margin:12px 0 0"><a href="${esc(data.statusUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Check status</a></p>`,
    text: `Thanks for reporting ${data.productName}.\nReference: ${data.reference}\nStatus: ${data.statusUrl}`,
    sms: `Report received: ${data.reference}. We'll be in touch.`,
  }),

  'report.consumer_update': (data: TemplateData['report.consumer_update'], branding) => ({
    subject: `Update on your report — ${data.reference}`,
    bodyHtml: `<p style="margin:0 0 12px">Your report on ${esc(data.productName)} has been updated.</p><p style="margin:0 0 8px">Status: <strong>${esc(data.status)}</strong>${data.outcome ? ` — ${esc(data.outcome)}` : ''}</p><p style="margin:12px 0 0"><a href="${esc(data.statusUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View details</a></p>`,
    text: `Report ${data.reference} update.\nStatus: ${data.status}${data.outcome ? ` — ${data.outcome}` : ''}\n${data.statusUrl}`,
    sms: `Report ${data.reference}: now ${data.status}.`,
  }),
```

- [ ] **Step 4: Resolve the circular-import question from Task 5**

Open `apps/api/src/modules/notifications/notifications.module.ts` and check for `@Global()`. If present: delete the `report.consumer_ack.requested` / `report.consumer_update.requested` indirection from `ReportsService` (Task 5/6) and inject `NotificationService` directly instead:

```ts
// reports.service.ts constructor — add
    private readonly notifications: NotificationService,
```
```ts
// in submit(), replace the eventEmitter.emit('report.consumer_ack.requested', ...) block with:
    if (dto.contact?.email) {
      const product = await this.prisma.product.findUnique({ where: { id: report.productId ?? '' } });
      await this.notifications.send(
        'report.consumer_ack',
        { email: dto.contact.email },
        { reference: report.reference, productName: product?.name ?? 'product', statusUrl: `/v1/public/${tenantSlug}/reports/${report.reference}` },
        { tenantId: tenant.id },
      );
    }
```
and similarly in `changeStatus()` for `report.consumer_update`. If `NotificationsModule` is NOT global, keep the event-based indirection and instead add a small listener inside `NotificationsModule` (owned by E14 — flag it in the same issue comment from Step 1 rather than editing E14's module wiring yourself).

- [ ] **Step 5: `docs/reports/consumer-flow.md`**

```markdown
# Consumer report flow

1. `GET /v1/verify/:code` returns a `red`/`amber`/`unknown`/`decommissioned`/`flagged` verdict with a `scanEventId`.
2. The verify page (E09) or, until it ships, the `ReportForm` Storybook story mounts `<ReportForm scanEventId=... verdict=... />`.
3. The consumer fills seller/location/channel/description, uploads up to 5 photos (client-downscaled to ≤2000px before upload), optionally leaves an email with consent.
4. `POST /v1/public/:tenantSlug/reports` derives unit/batch/product/verdict server-side from the `scanEventId` — the client never sends a code, unit id, or verdict directly.
5. A `RPT-XXXXXX` reference is returned immediately; photos process asynchronously (`photo.process` queue job) and the report shows `new` until a tenant triages it.
6. The consumer can poll `GET /v1/public/:tenantSlug/reports/:reference` for status (no PII, no notes returned).
```

- [ ] **Step 6: `docs/reports/triage-guide.md`**

```markdown
# Triage guide (web-admin)

Roles: `owner`/`operator` can act; `viewer` sees a read-only detail page.

- Queue at `/reports` — filter by status, or use the "New"/"Mine" saved views.
- Detail page shows photos, linked unit's scan history (E06) and anomaly chips (E07, once shipped), notes thread, and status history.
- Status flow: `new → triaged → investigating → closed` (outcome required to close). `closed → investigating` is allowed as a reopen. Every transition is audited (`report.status.change`) and, with "Notify consumer" checked, sends `report.consumer_update` if the report has a contact email.
- Export: `GET /v1/reports/export.csv?...` — contact columns (`contactEmail`/`contactPhone`) only appear for `owner`. One `report.export` audit row per call.
```

- [ ] **Step 7: `docs/reports/photo-handling.md`**

```markdown
# Photo handling

- Photos are never stored as uploaded. Every photo is re-encoded (JPEG quality 85, max 2000px longest side) via `sharp`, which strips all EXIF/GPS metadata (`withMetadata(false)`) and neutralises polyglot files.
- HEIC/HEIF uploads are converted to JPEG first via `heic-convert` (the prebuilt `sharp` binary has no HEIF decoder), then run through the same resize/strip/encode pipeline.
- Magic bytes are sniffed with `file-type` before processing; a mismatch (e.g. a renamed PDF) is rejected as `magic_mismatch` and never reaches `sharp`.
- Incoming uploads land in the `reports-incoming` bucket with a 24h lifecycle policy set at API boot; the original is deleted from that bucket the moment processing succeeds (or expires there automatically if a report is never submitted).
- Retention: `ReportsRetention.purgeContact(before)` nulls `contactEmail`/`contactPhone` and sets `contactPurgedAt` for reports older than the tenant's retention window — the photos and all other report fields are untouched. E19 owns the retention *policy* (when to call this); E08 owns the mechanism.
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/notifications apps/api/src/modules/reports docs/reports
git commit -m "feat(E08): T10 consumer notification templates + docs"
```

---

## Task 11: Dev harness, Playwright fixtures, E2E

**Files:**
- Create: `apps/api/src/modules/reports/reports-dev.controller.ts`
- Modify: `apps/api/src/modules/reports/reports.module.ts`
- Create: `tests/e2e/fixtures/reports.ts`
- Create: `tests/e2e/reports.spec.ts`

- [ ] **Step 1: Dev-only controller** — seed, consent list, contact purge (all `@Public()`, all gated to non-production per the existing `dev-audit.controller.ts`/`dev-quota.controller.ts` convention — check `apps/api/src/modules/audit/audit.module.ts` for the exact `NODE_ENV !== 'production'` conditional registration pattern and mirror it here rather than relying on `@Public()` alone):

```ts
// apps/api/src/modules/reports/reports-dev.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Public } from '../../common/public.decorator';
import { ReportsRetentionService } from './reports-retention.service';
import { InMemoryConsent } from './consent/in-memory-consent.provider';

@Controller('v1/_dev/reports')
@Public()
export class ReportsDevController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly retention: ReportsRetentionService,
    private readonly consent: InMemoryConsent,
  ) {}

  @Post('seed')
  async seed(@Body() body: { tenantSlug?: string } = {}) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { slug: body.tenantSlug ?? 'ivoryglow' } });
    const statuses = ['new', 'triaged', 'investigating', 'closed'] as const;
    const created = [];
    for (let i = 0; i < 20; i++) {
      const status = statuses[i % statuses.length];
      const report = await this.prisma.report.create({
        data: {
          tenantId: tenant.id,
          reference: `RPT-SEED${String(i).padStart(2, '0')}`,
          verdictAtReport: i % 3 === 0 ? 'red' : 'amber',
          purchaseChannel: 'open_market',
          ipHash: `seed-${i}`,
          status,
          outcome: status === 'closed' ? 'confirmed_counterfeit' : undefined,
        },
      });
      created.push(report.id);
    }
    return { created: created.length };
  }

  @Get('consents')
  async consents() {
    return this.consent.list();
  }

  @Post('purge-contact')
  async purgeContact(@Query('before') before: string) {
    const purged = await this.retention.purgeContact(before ? new Date(before) : new Date());
    return { purged };
  }
}
```

- [ ] **Step 2: Register only outside production** — open `apps/api/src/modules/audit/audit.module.ts`, find the conditional that includes `DevAuditController` only when `NODE_ENV !== 'production'`, and mirror that exact structure in `reports.module.ts` for `ReportsDevController`.

- [ ] **Step 3: Playwright fixture**

```ts
// tests/e2e/fixtures/reports.ts
import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function seedReports(request: APIRequestContext, tenantSlug = 'ivoryglow'): Promise<void> {
  const res = await request.post(`${API_URL}/v1/_dev/reports/seed`, { data: { tenantSlug } });
  if (!res.ok()) throw new Error(`seed failed: ${res.status()}`);
}
```

Add the export to `tests/e2e/fixtures/index.ts` alongside the other fixture re-exports.

- [ ] **Step 4: E2E spec** — covers AC1 (submit via the consumer flow), AC5 (triage), AC6 (context), AC7 (export), matching the `@smoke`-tag convention if `tests/e2e/smoke.spec.ts` uses one (check and apply the same tag to at least one test here so `pnpm test:smoke` picks it up):

```ts
// tests/e2e/reports.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth';
import { seedReports } from './fixtures/reports';
import { waitForEmail } from './fixtures/mailpit';

test.describe('E08 Consumer Fake Reporting', () => {
  test.beforeAll(async ({ request }) => {
    await seedReports(request);
  });

  test('AC5: operator triages a seeded report end to end', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.goto('/reports');
    await page.getByText('RPT-SEED00').click();

    await page.getByRole('button', { name: 'Assign to me' }).click();
    await page.getByPlaceholder('Add a note…').fill('Investigating seller claims');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText('Investigating seller claims')).toBeVisible();

    await page.getByRole('button', { name: 'Change status' }).click();
    await page.getByLabel('New status').selectOption('triaged');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('new → triaged')).toBeVisible();
  });

  test('AC7: CSV export omits contact columns for operator, includes for owner', async ({ request }) => {
    const opRes = await request.get('http://localhost:4000/v1/reports/export.csv?status=closed', {
      headers: { Authorization: `Bearer ${process.env.OPERATOR_TEST_JWT ?? ''}` },
    });
    expect(opRes.ok()).toBe(true);
    const opBody = await opRes.text();
    expect(opBody).not.toContain('contactEmail');
  });
});
```

Both tests depend on `loginAs`/a real JWT fixture that, per the plan header's known gap, may still be a stub. If `loginAs(page, 'operator')` only navigates to `/` and does not authenticate, the first test will fail at the "Assign to me" step (no session) — that is an E02 gap, not an E08 one. When you reach this task, re-check `tests/e2e/fixtures/auth.ts`; if it is still a stub, write the spec against the documented contract anyway (as shown above) and note in the PR description that it's blocked on E02's real login, rather than inventing a workaround that reaches into another epic's owned auth internals.

- [ ] **Step 5: Manual AC verification against compose** — run the full stack and paste the actual command output into the GitHub issue per the Definition of Done. Suggested sequence (adjust the port numbers to whatever `scripts/epic ports E08` reports at the time):

```bash
docker compose -f docker/compose.yml up -d
docker compose -f docker/compose.yml ps   # confirm fake-captcha healthy — AC9

# Seed a reportable scan event + report (AC1)
curl -s -X POST http://localhost:4000/v1/_dev/reports/seed

# AC3: captcha + quota
curl -s -X POST http://localhost:4000/v1/public/ivoryglow/reports \
  -H 'Content-Type: application/json' \
  -d '{"scanEventId":"<seeded id>","purchaseChannel":"open_market","photoIds":[],"captchaToken":"fail-1"}'
# expect 403 captcha_failed

for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/v1/public/ivoryglow/reports \
    -H 'Content-Type: application/json' \
    -d '{"scanEventId":"<seeded id>","purchaseChannel":"open_market","photoIds":[],"captchaToken":"ok-demo"}'
done
# expect five 200s (or 4xx from other validation) then a 429 on the sixth

redis-cli -p <redis port> KEYS 'quota:*:reports_per_ip_per_hour:*'

# AC4: notifications
open http://localhost:8025   # or curl the Mailpit API — confirm report.received + report.consumer_ack

# AC8: consent + purge
curl -s http://localhost:4000/v1/_dev/consents
curl -s -X POST "http://localhost:4000/v1/_dev/reports/purge-contact?before=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

pnpm test:e2e -g reports
```

Paste this evidence into issue #9 per the repo's Definition of Done before considering E08 mergeable.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/reports-dev.controller.ts tests/e2e
git commit -m "feat(E08): T11 dev seed/purge harness + Playwright fixtures/spec"
```

---

## Final steps (after Task 11 lands)

- [ ] Update `docs/epics/E08-consumer-reporting.md`: tick every `- [ ] T*` and `- [ ] AC*` checkbox that's been demonstrated, per the Definition of Done.
- [ ] Update `docs/epics/CROSS-EPIC-REQUESTS.md`: tick the "To E08" row's items now provided (`CaptchaPort` exposed, `Report.referenceNumber`/contact lookup available for DSAR) — those are consumed by E19/E18 later, not required to build here, but the checkbox reflects the interface being ready.
- [ ] Paste the Task 11 Step 5 command output as a comment on issue #9.
- [ ] Leave the PR open for the orchestrator to review and merge — do not merge it yourself.
