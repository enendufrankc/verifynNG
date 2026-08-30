# E13 Audit Log & Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tamper-evident audit log, security headers/CSP, secrets management with key rotation, Redis-backed tenant quotas, and CI security gates for the Verify Platform.

**Architecture:** Hash-chained append-only audit log in Postgres with DB-level immutability enforcement. NestJS modules (Audit, Quota, Secrets) imported once into AppModule. Security headers via helmet (API) and Next middleware (web apps). Shared CSP/security config in packages/config. Redis fixed-window counters for quotas. CI gates via GitHub Actions.

**Tech Stack:** NestJS, Prisma, PostgreSQL 16, Redis 7 + ioredis, BullMQ, helmet, Next.js 15, Vitest, Playwright, GitHub Actions

**E13 Ports (from .env):** API=5339, web-verify=4339, web-admin=4340, Postgres=6771, Redis=7718

---

## File Structure

### New files to create:
```
apps/api/src/modules/audit/audit.module.ts
apps/api/src/modules/audit/audit.service.ts
apps/api/src/modules/audit/audit.service.spec.ts
apps/api/src/modules/audit/audit.interceptor.ts
apps/api/src/modules/audit/audited.decorator.ts
apps/api/src/modules/audit/audited.spec.ts
apps/api/src/modules/audit/audit.controller.ts
apps/api/src/modules/audit/dev-audit.controller.ts
apps/api/src/modules/audit/audit-chain.controller.ts
apps/api/src/modules/audit/audit-chain.service.ts
apps/api/src/modules/audit/audit-chain.service.spec.ts
apps/api/src/modules/quota/quota.module.ts
apps/api/src/modules/quota/quota.service.ts
apps/api/src/modules/quota/quota.service.spec.ts
apps/api/src/modules/quota/quota.controller.ts
apps/api/src/modules/quota/quota-error.filter.ts
apps/api/src/modules/quota/dev-quota.controller.ts
apps/api/src/modules/secrets/secrets.module.ts
apps/api/src/modules/secrets/secrets.port.ts
apps/api/src/modules/secrets/env-file-secrets.ts
apps/api/src/modules/secrets/secrets-key-ring.ts
apps/api/src/modules/secrets/secrets-key-ring.spec.ts
apps/api/src/modules/secrets/dev-secrets.controller.ts
apps/api/src/security/security.module.ts
apps/api/src/security/helmet.setup.ts
apps/api/src/security/cors.setup.ts
packages/config/src/security/index.ts
packages/config/src/security/csp.ts
packages/config/src/security/headers.ts
packages/config/src/security/cors.ts
packages/config/src/security/csp.spec.ts
packages/config/src/security/cors.spec.ts
packages/db/prisma/migrations/E13_audit_append_only/migration.sql
apps/web-admin/middleware.ts
apps/web-verify/middleware.ts
apps/web-admin/app/(console)/audit/page.tsx
tools/scripts/secrets/rotate-core-key.ts
.github/workflows/security.yml
.github/dependabot.yml
.gitleaks.toml
SECURITY.md
docs/security/threat-model.md
docs/security/secrets.md
docs/security/key-rotation-runbook.md
docs/security/ci-gates.md
docker/secrets/.gitkeep
```

### Files to modify:
```
packages/db/prisma/schema.prisma                    (additive E13 block)
packages/config/src/env-schema.ts                   (add E13 section)
packages/config/src/index.ts                        (re-export security)
apps/api/src/app.module.ts                          (one-line imports)
apps/api/src/main.ts                                (helmet + CORS setup)
apps/api/package.json                               (add deps: helmet, bullmq)
apps/web-admin/next.config.ts                       (standalone output)
apps/web-verify/next.config.ts                      (standalone output)
README.md                                            (link SECURITY.md)
```

---

## Task 1: Schema Migration — E13 AuditLog extensions + new models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/E13_audit_append_only/migration.sql`

- [ ] **Step 1: Update schema.prisma with E13 additive block**

Modify the AuditLog model to add E13 fields and add the new models. The existing E00 AuditLog has: id, tenantId, actorId, action, target (string), payload (Json), prevHash, hash, createdAt. E13 needs to add: seq, actorType, actorIp, requestId, targetType, targetId — and replace the single `target` string with targetType+targetId. Since this is an additive block by agreement with E00, we update the existing model:

```prisma
// ── E13 — Audit & Security ────────────────────────────────────

enum AuditActorType { user system oem support apikey }

model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String?
  actorId   String?
  action    String
  target    String   // kept for backwards compat; E13 adds targetType+targetId
  payload   Json
  prevHash  String?
  hash      String
  createdAt DateTime @default(now())

  // E13 additions
  seq          BigInt   @unique @default(autoincrement())
  actorType    AuditActorType @default(user)
  actorIp      String?
  requestId    String?
  targetType   String   @default("")
  targetId     String   @default("")

  tenant Tenant? @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([tenantId, createdAt])
  @@index([tenantId, action, createdAt])
  @@index([targetType, targetId])
}

model AuditChainCheckpoint {
  id            String   @id @default(cuid())
  fromSeq       BigInt
  toSeq         BigInt
  headHash      String
  ok            Boolean
  rowsChecked   Int
  firstBadSeq   BigInt?
  triggeredById String?
  createdAt     DateTime @default(now())
}

model QuotaOverride {
  id          String   @id @default(cuid())
  tenantId    String
  kind        String
  limit       Int
  window      String
  note        String?
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, kind])
}
```

- [ ] **Step 2: Create the migration SQL**

The migration must: add new columns to AuditLog, create AuditChainCheckpoint and QuotaOverride tables, create audit_chain_head single-row table, add the immutability trigger, revoke UPDATE/DELETE from verifyng_app role.

```bash
cd packages/db && npx prisma migrate dev --name E13_audit_append_only --create-only
```

Then edit the generated migration to add the raw SQL parts (trigger, revokes, audit_chain_head).

- [ ] **Step 3: Verify migration generates correctly**

Run: `cd packages/db && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`

- [ ] **Step 4: Run the migration against compose Postgres**

```bash
docker compose -f docker/compose.yml up -d postgres redis
pnpm db:migrate
```

Expected: migration succeeds, schema updated.

- [ ] **Step 5: Regenerate Prisma client**

```bash
cd packages/db && npx prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(E13): add audit log schema extensions and append-only migration"
```

---

## Task 2: AuditService — record() with chain-head locking, canonical hashing, redaction

**Files:**
- Create: `apps/api/src/modules/audit/audit.service.ts`
- Create: `apps/api/src/modules/audit/audit.service.spec.ts`
- Create: `apps/api/src/modules/audit/audit.module.ts`

- [ ] **Step 1: Write the failing test for AuditService.record()**

Test: insert one record, verify hash chain. Insert second, verify prevHash matches first hash. Verify REDACT_KEYS redaction. Verify canonicalize determinism (key order independence).

```typescript
// apps/api/src/modules/audit/audit.service.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuditService } from './audit.service.js';
import { PrismaClient } from '@prisma/client';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';

describe('AuditService', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: AuditService;

  beforeAll(async () => {
    const db = await createTestDatabase(import.meta.url);
    prisma = db.prisma;
    schemaName = db.schemaName;
    // Initialize audit_chain_head
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "audit_chain_head" (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        "prevHash" TEXT NOT NULL DEFAULT 'GENESIS',
        "lastSeq" BIGINT NOT NULL DEFAULT 0
      );
      INSERT INTO "audit_chain_head" (id, "prevHash", "lastSeq")
      VALUES (1, 'GENESIS', 0)
      ON CONFLICT (id) DO NOTHING;
    `);
    service = new AuditService(prisma, { emit: () => {} } as any);
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  it('records an audit entry with correct hash chain', async () => {
    const entry1 = await service.record({
      tenantId: 'tenant1',
      actor: { type: 'user', id: 'user1', ip: '127.0.0.1' },
      action: 'test.action',
      target: { type: 'resource', id: 'res1' },
      payload: { foo: 'bar' },
      requestId: 'req1',
    });

    expect(entry1.seq).toBe(1n);
    expect(entry1.prevHash).toBe('GENESIS');
    expect(entry1.hash).toBeDefined();

    const entry2 = await service.record({
      tenantId: 'tenant1',
      actor: { type: 'system' },
      action: 'test.action2',
      target: { type: 'resource', id: 'res2' },
    });

    expect(entry2.seq).toBe(2n);
    expect(entry2.prevHash).toBe(entry1.hash);
  });

  it('redacts sensitive keys from payload', async () => {
    const entry = await service.record({
      actor: { type: 'user' },
      action: 'test.redact',
      target: { type: 'x', id: '1' },
      payload: {
        password: 'secret123',
        token: 'tok123',
        safe: 'visible',
        authorization: 'Bearer abc',
      },
    });

    const payload = entry.payload as Record<string, unknown>;
    expect(payload.password).toBe('[REDACTED]');
    expect(payload.token).toBe('[REDACTED]');
    expect(payload.authorization).toBe('[REDACTED]');
    expect(payload.safe).toBe('visible');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/audit/audit.service.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AuditService**

```typescript
// apps/api/src/modules/audit/audit.service.ts
import { Injectable, EventEmitter2 } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { canonicalize } from '@verifynng/core';
import crypto from 'node:crypto';

const REDACT_KEYS = [
  'password', 'token', 'secret', 'code', 'tier2Code', 'authorization',
];

export interface AuditActor {
  type: 'user' | 'system' | 'oem' | 'support' | 'apikey';
  id?: string;
  ip?: string;
}

export interface AuditEntry {
  tenantId?: string;
  actor: AuditActor;
  action: string;
  target: { type: string; id: string };
  payload?: Record<string, unknown>;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async record(entry: AuditEntry) {
    const redacted = entry.payload
      ? this.redact(entry.payload)
      : {};

    // Lock the chain head and get prevHash atomically
    const head = await this.prisma.$queryRaw<Array<{ prevHash: string; lastSeq: bigint }>>`
      SELECT "prevHash", "lastSeq" FROM "audit_chain_head"
      WHERE id = 1 FOR UPDATE
    `;

    const prevHash = head[0].prevHash;
    const seq = head[0].lastSeq + 1n;

    // Compute hash
    const hashInput = {
      seq: Number(seq),
      tenantId: entry.tenantId ?? null,
      actorType: entry.actor.type,
      actorId: entry.actor.id ?? null,
      actorIp: entry.actor.ip ?? null,
      requestId: entry.requestId ?? null,
      action: entry.action,
      targetType: entry.target.type,
      targetId: entry.target.id,
      payload: redacted,
      createdAt: new Date().toISOString(),
    };
    const hash = crypto
      .createHash('sha256')
      .update(prevHash + canonicalize(hashInput))
      .digest('hex');

    // Insert in the same transaction
    const row = await this.prisma.$executeRaw`
      INSERT INTO "AuditLog" (
        "id", "tenantId", "actorId", "action", "target", "payload",
        "prevHash", "hash", "seq", "actorType", "actorIp", "requestId",
        "targetType", "targetId", "createdAt"
      ) VALUES (
        gen_random_uuid(),
        ${entry.tenantId ?? null}::text,
        ${entry.actor.id ?? null}::text,
        ${entry.action}::text,
        ${entry.target.type + ':' + entry.target.id}::text,
        ${JSON.stringify(redacted)}::jsonb,
        ${prevHash}::text,
        ${hash}::text,
        ${seq}::bigint,
        ${entry.actor.type}::"AuditActorType",
        ${entry.actor.ip ?? null}::text,
        ${entry.requestId ?? null}::text,
        ${entry.target.type}::text,
        ${entry.target.id}::text,
        NOW()
      )
    `;

    // Update chain head
    await this.prisma.$executeRaw`
      UPDATE "audit_chain_head"
      SET "prevHash" = ${hash}::text, "lastSeq" = ${seq}::bigint
      WHERE id = 1
    `;

    // Emit event
    this.eventEmitter.emit('audit.recorded', {
      seq: Number(seq),
      tenantId: entry.tenantId,
      action: entry.action,
      target: entry.target,
      actorType: entry.actor.type,
    });

    return this.prisma.auditLog.findFirst({ where: { seq } });
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (REDACT_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
```

- [ ] **Step 4: Create AuditModule**

```typescript
// apps/api/src/modules/audit/audit.module.ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useValue: new PrismaClient(),
    },
    {
      provide: EventEmitter2,
      useValue: new EventEmitter2(),
    },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/audit/audit.service.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/audit/
git commit -m "feat(E13): AuditService with chain-head locking, canonical hashing, redaction"
```

---

## Task 3: @Audited() Decorator + AuditInterceptor

**Files:**
- Create: `apps/api/src/modules/audit/audited.decorator.ts`
- Create: `apps/api/src/modules/audit/audit.interceptor.ts`
- Create: `apps/api/src/modules/audit/audited.spec.ts`

- [ ] **Step 1: Write the failing test**

Test that the interceptor records after 2xx and skips on error. Test target resolution from req.params.

- [ ] **Step 2: Implement @Audited() decorator (SetMetadata)**

```typescript
// apps/api/src/modules/audit/audited.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'audited';

export interface AuditedOptions {
  action: string;
  target?: (req: any, res: any) => { type: string; id: string };
  redact?: string[];
}

export const Audited = (action: string, opts?: Omit<AuditedOptions, 'action'>) =>
  SetMetadata(AUDITED_KEY, { action, ...opts } as AuditedOptions);
```

- [ ] **Step 3: Implement AuditInterceptor**

Records only on 2xx, extracts actor from req.user (stubbed until E02), target from req.params.id or custom resolver.

- [ ] **Step 4: Write unit tests with a throwaway controller**

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/audit/audited.decorator.ts apps/api/src/modules/audit/audit.interceptor.ts apps/api/src/modules/audit/audited.spec.ts
git commit -m "feat(E13): @Audited decorator and AuditInterceptor"
```

---

## Task 4: verifyChain() + Audit Controller Endpoints

**Files:**
- Create: `apps/api/src/modules/audit/audit-chain.service.ts`
- Create: `apps/api/src/modules/audit/audit-chain.service.spec.ts`
- Create: `apps/api/src/modules/audit/audit.controller.ts`
- Create: `apps/api/src/modules/audit/audit-chain.controller.ts`
- Create: `apps/api/src/modules/audit/dev-audit.controller.ts`

- [ ] **Step 1: Write failing test for verifyChain()**

Test: insert 3 records, verifyChain returns ok=true. Manually tamper a row (bypassing trigger in test), verifyChain returns ok=false with firstBadSeq.

- [ ] **Step 2: Implement AuditChainService.verifyChain()**

Streams rows by seq, recomputes hashes, writes AuditChainCheckpoint.

- [ ] **Step 3: Implement audit controllers**

- `GET /v1/audit` — query with filters, cursor pagination
- `GET /v1/audit/chain` — last checkpoint
- `POST /v1/audit/chain/verify` — trigger verify (returns jobId)
- `GET /v1/support/audit` — cross-tenant (role: support)
- `POST /v1/_dev/audit-demo` — dev-only demo endpoint with @Audited('demo.touch')

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/audit/
git commit -m "feat(E13): verifyChain, audit HTTP endpoints, dev demo controller"
```

---

## Task 5: Packages Config — Security Module (CSP, Headers, CORS)

**Files:**
- Create: `packages/config/src/security/index.ts`
- Create: `packages/config/src/security/csp.ts`
- Create: `packages/config/src/security/cors.ts`
- Create: `packages/config/src/security/headers.ts`
- Create: `packages/config/src/security/csp.spec.ts`
- Create: `packages/config/src/security/cors.spec.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/src/env-schema.ts`

- [ ] **Step 1: Write failing test for buildCsp()**

Test that CSP contains nonce, strict-dynamic, frame-ancestors none, object-src none. Test report-only mode.

- [ ] **Step 2: Implement buildCsp()**

```typescript
// packages/config/src/security/csp.ts
export function buildCsp(opts: {
  nonce: string;
  apiOrigin: string;
  extraConnect?: string[];
  reportOnly?: boolean;
}): Record<string, string> {
  const connectSrc = [
    "'self'",
    opts.apiOrigin,
    ...(opts.extraConnect ?? []),
  ];
  const csp = [
    `script-src 'nonce-${opts.nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const header = opts.reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';
  return { [header]: csp };
}
```

- [ ] **Step 3: Implement SECURITY_HEADERS and corsAllowlist()**

- [ ] **Step 4: Add E13 env vars to env-schema.ts**

Add: `CORE_KEYS_JSON`, `CORS_ORIGINS_ADMIN`, `CORS_ORIGINS_VERIFY`, `CSP_REPORT_ONLY`, `SECRETS_FILE`.

- [ ] **Step 5: Update packages/config/src/index.ts to re-export security**

- [ ] **Step 6: Run tests**

- [ ] **Step 7: Commit**

```bash
git add packages/config/
git commit -m "feat(E13): security config — CSP builder, headers, CORS allowlists"
```

---

## Task 6: API Security — Helmet, CORS, HSTS

**Files:**
- Create: `apps/api/src/security/security.module.ts`
- Create: `apps/api/src/security/helmet.setup.ts`
- Create: `apps/api/src/security/cors.setup.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/package.json` (add helmet)

- [ ] **Step 1: Install helmet dependency**

```bash
cd apps/api && pnpm add helmet
```

- [ ] **Step 2: Implement helmet setup with shared SECURITY_HEADERS**

Apply helmet with HSTS only in production, content-type sniffing protection, etc.

- [ ] **Step 3: Implement CORS setup using corsAllowlist() from config**

Enforce allowlist based on CORS_ORIGINS_ADMIN/CORS_ORIGINS_VERIFY env vars.

- [ ] **Step 4: Wire into main.ts**

Call `app.use(helmet())` and `app.enableCors(corsOptions)`.

- [ ] **Step 5: Verify headers with a running API**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/security/ apps/api/src/main.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(E13): helmet, CORS, HSTS for API"
```

---

## Task 7: Next.js Middleware — CSP Nonce + Security Headers

**Files:**
- Create: `apps/web-admin/middleware.ts`
- Create: `apps/web-verify/middleware.ts`

- [ ] **Step 1: Implement web-admin middleware.ts**

Generate per-request nonce, set CSP with nonce, set X-Frame-Options, Referrer-Policy, X-Content-Type-Options. Pass nonce via x-nonce response header.

```typescript
// apps/web-admin/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildCsp, SECURITY_HEADERS } from '@verifynng/config/security';
import crypto from 'node:crypto';

export function middleware(request: NextRequest) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const response = NextResponse.next();

  // Set CSP
  const cspHeaders = buildCsp({
    nonce,
    apiOrigin: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    reportOnly: process.env.CSP_REPORT_ONLY === 'true',
  });

  for (const [key, value] of Object.entries(cspHeaders)) {
    response.headers.set(key, value);
  }

  // Set other security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Pass nonce to the app
  response.headers.set('x-nonce', nonce);

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Implement web-verify middleware.ts (same pattern)**

- [ ] **Step 3: Verify headers against running web-admin and web-verify**

- [ ] **Step 4: Commit**

```bash
git add apps/web-admin/middleware.ts apps/web-verify/middleware.ts
git commit -m "feat(E13): CSP nonce + security headers in Next.js middleware"
```

---

## Task 8: SecretsModule — SecretsPort, EnvFileSecrets, SecretsKeyRing

**Files:**
- Create: `apps/api/src/modules/secrets/secrets.module.ts`
- Create: `apps/api/src/modules/secrets/secrets.port.ts`
- Create: `apps/api/src/modules/secrets/env-file-secrets.ts`
- Create: `apps/api/src/modules/secrets/secrets-key-ring.ts`
- Create: `apps/api/src/modules/secrets/secrets-key-ring.spec.ts`
- Create: `apps/api/src/modules/secrets/dev-secrets.controller.ts`

- [ ] **Step 1: Write failing test for SecretsKeyRing**

Test that it parses CORE_KEYS_JSON, returns active key, falls back to CORE_KEYS/CORE_ACTIVE_KID.

- [ ] **Step 2: Implement SecretsPort interface**

```typescript
// apps/api/src/modules/secrets/secrets.port.ts
export const SECRETS_TOKEN = Symbol('SECRETS_TOKEN');

export interface SecretsPort {
  get(name: string): Promise<string | undefined>;
  list(prefix: string): Promise<string[]>;
}
```

- [ ] **Step 3: Implement EnvFileSecrets**

Reads from process.env first, then from SECRETS_FILE (default docker/secrets/local.env).

- [ ] **Step 4: Implement SecretsKeyRing implementing KeyRing**

Parses CORE_KEYS_JSON = `{ "active": "k2", "keys": { "k1": "<hex>", "k2": "<hex>" } }`. Falls back to E01's CORE_KEYS/CORE_ACTIVE_KID format.

- [ ] **Step 5: Create SecretsModule**

Binds SecretsKeyRing as the app-wide KeyRing provider and EnvFileSecrets as the SecretsPort.

- [ ] **Step 6: Add dev endpoint `GET /v1/_dev/keyring`**

Returns active kid and list of all kids.

- [ ] **Step 7: Run tests**

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/secrets/
git commit -m "feat(E13): SecretsModule with SecretsPort, EnvFileSecrets, SecretsKeyRing"
```

---

## Task 9: Key Rotation Script + Runbook

**Files:**
- Create: `tools/scripts/secrets/rotate-core-key.ts`
- Create: `docs/security/key-rotation-runbook.md`
- Create: `docs/security/secrets.md`

- [ ] **Step 1: Implement pnpm secrets:rotate-core-key script**

Generates 32 random bytes, appends to CORE_KEYS_JSON.keys, flips active, refuses to delete kids, prints diff.

- [ ] **Step 2: Write key-rotation-runbook.md**

Document: rotate → deploy → confirm new mints carry new kid → never retire kid while printed batch references it → retirement checklist.

- [ ] **Step 3: Write secrets.md**

Document the SecretsPort swap point with sketch for AWS Secrets Manager / Cloudflare Secrets.

- [ ] **Step 4: Add script to root package.json**

```json
"secrets:rotate-core-key": "tsx tools/scripts/secrets/rotate-core-key.ts",
"secrets:init": "tsx tools/scripts/secrets/init.ts"
```

- [ ] **Step 5: Create init script that generates docker/secrets/local.env**

- [ ] **Step 6: Commit**

```bash
git add tools/scripts/secrets/ docs/security/ package.json
git commit -m "feat(E13): key rotation script, runbook, secrets docs"
```

---

## Task 10: QuotaModule — Redis Fixed-Window Counters

**Files:**
- Create: `apps/api/src/modules/quota/quota.module.ts`
- Create: `apps/api/src/modules/quota/quota.service.ts`
- Create: `apps/api/src/modules/quota/quota.service.spec.ts`
- Create: `apps/api/src/modules/quota/quota.controller.ts`
- Create: `apps/api/src/modules/quota/quota-error.filter.ts`
- Create: `apps/api/src/modules/quota/dev-quota.controller.ts`

- [ ] **Step 1: Write failing test for QuotaService.assertWithinQuota()**

Test: within limit succeeds, over limit throws QuotaExceededError. Test registerKind. Test override precedence.

- [ ] **Step 2: Implement QuotaService with Lua script**

Redis fixed-window counters using INCRBY + EXPIRE in a Lua script for atomicity. Defaults: mints_per_day=50000, scans_per_min=600, api_calls_per_min=300. QuotaOverride lookup cached 60s. QuotaExceededError → 429 with Retry-After. quota.exceeded event debounced 1/min.

- [ ] **Step 3: Implement QuotaExceededError filter**

Returns HTTP 429 with Retry-After header.

- [ ] **Step 4: Implement quota controllers**

- `GET /v1/quotas` — all kinds with used/limit
- `PUT /v1/support/quotas/:tenantId` — upsert overrides
- `POST /v1/_dev/quota-demo` — dev controller with demo_per_min kind (limit 10)

- [ ] **Step 5: Create QuotaModule**

- [ ] **Step 6: Integration test against compose Redis**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/quota/
git commit -m "feat(E13): QuotaModule with Redis fixed-window counters"
```

---

## Task 11: Wire-up — AppModule Imports + Env Config + Docker Secrets

**Files:**
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/config/src/env-schema.ts`
- Modify: `docker/compose.yml`
- Create: `docker/secrets/.gitkeep`
- Create: `tools/scripts/secrets/init.ts`

- [ ] **Step 1: Add E13 env vars to env-schema.ts**

CORE_KEYS_JSON, CORS_ORIGINS_ADMIN, CORS_ORIGINS_VERIFY, CSP_REPORT_ONLY, SECRETS_FILE with compose defaults.

- [ ] **Step 2: Import AuditModule, QuotaModule, SecretsModule in AppModule**

One-line imports each.

- [ ] **Step 3: Mount docker/secrets/local.env in compose**

Add volume mount for api service. Update api entrypoint to run secrets:init if file missing.

- [ ] **Step 4: Update docker/.env with E13 vars**

- [ ] **Step 5: Verify full stack starts**

```bash
docker compose -f docker/compose.yml down -v
docker compose -f docker/compose.yml up -d --build
docker compose -f docker/compose.yml logs api
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.module.ts packages/config/src/env-schema.ts docker/ tools/scripts/
git commit -m "feat(E13): wire up modules in AppModule, env config, docker secrets mount"
```

---

## Task 12: Web-Admin Audit Viewer Page

**Files:**
- Create: `apps/web-admin/app/(console)/audit/page.tsx`

- [ ] **Step 1: Create audit page with table, filters, chain badge**

Server component that fetches /v1/audit with query params. Table with columns: seq, action, actor, target, timestamp. Filters for action, actor, date range. Chain integrity badge (green/red). "Verify now" button for owners. Row drawer with payload JSON.

- [ ] **Step 2: Register nav entry**

(Stub until E11 ships nav.config.ts — add a TODO comment)

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/app/\(console\)/audit/
git commit -m "feat(E13): audit viewer page in web-admin"
```

---

## Task 13: CI Security Gates

**Files:**
- Create: `.github/workflows/security.yml`
- Create: `.github/dependabot.yml`
- Create: `.gitleaks.toml`
- Create: `docs/security/ci-gates.md`

- [ ] **Step 1: Create security.yml workflow**

Jobs: pnpm-audit (fails on high), gitleaks, CodeQL.

- [ ] **Step 2: Create dependabot.yml**

npm weekly grouped, github-actions monthly, docker monthly.

- [ ] **Step 3: Create .gitleaks.toml**

Allowlist for packages/core/test/fixtures.

- [ ] **Step 4: Write ci-gates.md triage documentation**

- [ ] **Step 5: Commit**

```bash
git add .github/ .gitleaks.toml docs/security/ci-gates.md
git commit -m "feat(E13): CI security gates — audit, gitleaks, CodeQL, Dependabot"
```

---

## Task 14: SECURITY.md + Threat Model

**Files:**
- Create: `SECURITY.md`
- Create: `docs/security/threat-model.md`
- Modify: `README.md` (add links)

- [ ] **Step 1: Write SECURITY.md**

Reporting channel, supported versions, disclosure SLA.

- [ ] **Step 2: Write threat-model.md**

STRIDE analysis over: verify endpoint, mint path, manifest delivery, admin console, audit log itself. Encryption-at-rest statement. Incident response with NDPR 72h / UK GDPR notification steps. List every mitigation with the epic that implements it.

- [ ] **Step 3: Link from README.md**

- [ ] **Step 4: Commit**

```bash
git add SECURITY.md docs/security/threat-model.md README.md
git commit -m "feat(E13): SECURITY.md and threat model documentation"
```

---

## Task 15: End-to-End Verification — Demonstrate All ACs

**Files:** None new — verification only

- [ ] **AC1**: Run `curl -X POST localhost:5339/v1/_dev/audit-demo` 3x, query audit, attempt direct UPDATE
- [ ] **AC2**: Tamper drill — disable trigger, update, re-enable, verifyChain, check badge
- [ ] **AC3**: Verify headers on all three apps (CSP nonce, X-Frame-Options, CORS)
- [ ] **AC4**: Rotate core key, restart API, verify keyring endpoint
- [ ] **AC5**: Quota demo — 12 requests, verify 429s with Retry-After
- [ ] **AC6**: Playwright test for audit viewer with different roles (stub auth)
- [ ] **AC7**: Verify CI security workflow files exist and are valid
- [ ] **AC8**: Verify SECURITY.md and threat-model.md exist and are linked

- [ ] **Paste all evidence in GitHub Issue #14**

- [ ] **Set epic Status: done, close issue**

---

## Dependency order

```
T1 (schema) → T2 (AuditService) → T3 (@Audited) → T4 (verifyChain + controllers)
T5 (config/security) → T6 (API helmet/CORS) + T7 (Next middleware)   [parallel with T2-T4]
T8 (SecretsModule) → T9 (rotation script)                            [parallel with T2-T4]
T10 (QuotaModule)                                                    [parallel with T2-T4]
T11 (wire-up) — after T2, T8, T10                                    [depends on all modules]
T12 (audit viewer) — after T4, T11                                   [depends on endpoints]
T13 (CI gates)                                                        [independent]
T14 (docs)                                                            [independent]
T15 (E2E verification) — after everything
```
