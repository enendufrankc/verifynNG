# E19 Milestone 1 — Legal Document Publishing (AC1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first vertical slice of epic E19 (Compliance & Data Governance): platform-authored legal documents (privacy, terms, aup, cookie, subprocessors) are seeded, versioned, served publicly via `GET /v1/legal/:kind`, and rendered on `apps/web-verify` at `/legal/:kind`. This satisfies E19's **AC1** end to end.

**Architecture:** Reuse and additively extend the `PolicyDocument` model that E00/E03 already built (do **not** create a parallel `LegalDocument` model — see "Key decisions" below). Add a new `LegalModule` (`apps/api/src/modules/legal/`) with a `LegalDocumentService` that reads/writes `PolicyDocument` rows and a `LegalController` exposing the public routes. Seed real markdown content from `content/legal/**` into `PolicyDocument`. Render on `apps/web-verify` with server components that fetch from the API and render sanitized markdown.

This same PR also lands the **full E19 Prisma schema** (all models T1–T15 will eventually need: `ConsentRecord`, `RetentionRun`, `LegalHold`, `DsarRequest`, `Incident`) in one migration, per the repo's "one migration per PR" hot-spot rule for `schema.prisma` — those models are unused by this milestone's code but will be built out in later milestones without further migrations.

**Tech Stack:** NestJS + Prisma (existing `packages/db` singleton `prisma` client, not per-request DI), Next.js 15 App Router server components, `marked` + `sanitize-html` for markdown rendering, Vitest with real-Postgres integration tests (`*.postgres.spec.ts` convention using `createTestDatabase`/`dropTestSchema` from `@verifynng/db`).

---

## Key decisions (read before coding)

1. **No new `LegalDocument`/`TenantAcceptance` models.** E00/E03 already shipped `PolicyDocument` (`kind: PolicyKind, version: String, markdown, effectiveFrom`) and `PolicyAcceptance` (`tenantId, userId, kind, version`), plus a working `TenantStatusGuard` that already blocks tenant-console writes on unaccepted `aup`/`tos` policy bumps. The E19 epic file's own "Notes and decisions" section says _"Agreed boundary — do not duplicate the acceptance table."_ We honor that by treating `PolicyDocument`/`PolicyAcceptance` as the real implementation of the epic's `LegalDocument`/`TenantAcceptance` interfaces and extending them additively (new optional/defaulted fields only, no renames, no dropped fields).
2. **Kind naming mismatch, resolved at the HTTP boundary.** The epic's public URL contract uses `terms` (e.g. `/legal/terms`); the existing enum value is `PolicyKind.tos`. We keep the DB enum value `tos` (renaming it would touch E03's existing rows/code) and translate `terms ⇄ tos` only inside `LegalDocumentService`/`LegalController`. `privacy`, `aup`, `cookie`, `subprocessors` are 1:1.
3. **`PolicyKind` enum gains two new values** (`cookie`, `subprocessors`) — additive, since nothing currently switches exhaustively on this enum in a way that would break (verified: only `tenants.controller.ts`'s stub `current()` handler and `tenant-lifecycle.service.ts`'s `currentVersions()` reference `aup`/`tos` literals directly; neither breaks from new enum values).
4. **`PolicyDocument` gains four new fields**: `locale` (default `"en"`), `changeSummary` (nullable), `requiresReacceptance` (default `false`), `publishedById` (nullable). The unique constraint changes from `@@unique([kind, version])` to `@@unique([kind, locale, version])` — safe, since it's a superset key (existing rows all get `locale="en"` by default, so uniqueness is preserved).
5. **Version stays an opaque `String`, not an incrementing `Int`.** The existing seed already uses date-strings (`"2026-08-01"`) for `aup`/`tos`. New kinds (`privacy`, `cookie`, `subprocessors`) start at `"1"` since they have no prior rows — this satisfies AC1's `jq .version` → `1` check for `privacy` (the only kind AC1 checks the literal version string for). `aup`/`tos` keep their existing `"2026-08-01"` row; this milestone's seed **updates that row's `markdown` in place** (same kind+locale+version key) with the real authored content rather than creating a second version — from the document's perspective this is still "v1" (the first and only version), just not the literal string `"1"`.
6. **Scope cut for this milestone:** the platform-support authoring UI (T2's `/legal-docs` screen), tenant re-acceptance interstitial (T4), `ConsentService` (T5), retention engine (T6/T7), DSAR (T8/T9), incidents (T12), and the cookie-less Playwright suite (T13) are **out of scope** for this plan. Only the schema for those (already-designed, from the epic file verbatim) lands now; their services/controllers/UI land in later plans. This plan closes exactly E19's **AC1**.
7. **Route prefix:** new E19 HTTP routes use `v1/` in the `@Controller()` path (e.g. `@Controller('v1/legal')`), matching the epic file's documented interface and E06's `@Controller('v1/verify')` — even though the pre-existing `tenants`/`policies` controller predates that convention and has no prefix. That inconsistency belongs to E03's owned path; not touched here.

---

## File Structure

- Modify: `packages/db/prisma/schema.prisma` — extend `PolicyKind`, extend `PolicyDocument`, add 5 new E19 models/enums.
- Create: `packages/db/prisma/migrations/<timestamp>_E19_compliance/migration.sql` (generated by `prisma migrate dev`).
- Modify: `packages/config/src/env-schema.ts` — add `e19Schema`, merge it in.
- Create: `apps/api/src/modules/legal/legal-document.service.ts`
- Create: `apps/api/src/modules/legal/legal-document.service.postgres.spec.ts`
- Create: `apps/api/src/modules/legal/legal.controller.ts`
- Create: `apps/api/src/modules/legal/legal.module.ts`
- Modify: `apps/api/src/app.module.ts` — one import line + one entry in `imports`.
- Create: `packages/db/prisma/seed/legal-documents.ts`
- Modify: `packages/db/prisma/seed.ts` — one import + one call.
- Create: `content/legal/privacy/en.md`, `content/legal/terms/en.md`, `content/legal/aup/en.md`, `content/legal/cookie/en.md`, `content/legal/subprocessors/en.md`
- Modify: `apps/web-verify/package.json` — add `marked`, `sanitize-html`, `@types/sanitize-html`.
- Create: `apps/web-verify/app/legal/[kind]/page.tsx`

---

## Task 1: Extend the Prisma schema and migrate

**Files:**

- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Extend the `PolicyKind` enum**

Find (around line 37):

```prisma
enum PolicyKind {
  aup
  tos
  privacy
}
```

Replace with:

```prisma
enum PolicyKind {
  aup
  tos
  privacy
  cookie        // ─ E19 addition
  subprocessors // ─ E19 addition
}
```

- [ ] **Step 2: Extend the `PolicyDocument` model**

Find (around line 169):

```prisma
model PolicyDocument {
  id String @id @default(cuid())
  kind PolicyKind
  version String
  markdown String
  effectiveFrom DateTime
  createdAt DateTime @default(now())
  @@unique([kind, version])
}
```

Replace with:

```prisma
model PolicyDocument {
  id String @id @default(cuid())
  kind PolicyKind
  version String
  markdown String
  effectiveFrom DateTime
  createdAt DateTime @default(now())
  // ─── E19 additions: locale support + authoring metadata ───
  locale String @default("en")
  changeSummary String?
  requiresReacceptance Boolean @default(false)
  publishedById String?
  @@unique([kind, locale, version])
  @@index([kind, locale, effectiveFrom])
}
```

- [ ] **Step 3: Append the new E19 models at the end of the file**

Append to the end of `packages/db/prisma/schema.prisma`:

```prisma

// ─── E19 Compliance & Data Governance ────────────────────────────────────────
// LegalDocument versioning reuses PolicyDocument/PolicyAcceptance above (see
// docs/superpowers/plans/2026-08-30-e19-legal-documents-milestone1.md "Key
// decisions") — the models below are net-new and unused by any other epic.

enum ConsentSubjectType { consumer user }
enum ConsentPurpose { contact_followup marketing analytics_optional terms_acceptance }
enum ConsentSource { report_form signup admin_preferences legal_reaccept import }

model ConsentRecord {
  id              String             @id @default(cuid())
  tenantId        String?
  subjectType     ConsentSubjectType
  subjectRef      String
  purpose         ConsentPurpose
  granted         Boolean
  source          ConsentSource
  documentKind    PolicyKind?
  documentVersion String?
  evidence        Json?
  at              DateTime           @default(now())
  @@index([tenantId, subjectType, subjectRef, purpose, at])
  @@index([subjectType, subjectRef, purpose, at])
}

model RetentionRun {
  id          String    @id @default(cuid())
  policy      String
  dryRun      Boolean
  cutoff      DateTime
  matched     Int
  affected    Int
  startedAt   DateTime
  finishedAt  DateTime?
  error       String?
  triggeredBy String
  @@index([policy, startedAt])
}

enum LegalHoldScope { tenant unit report consumer }
model LegalHold {
  id          String         @id @default(cuid())
  tenantId    String?
  scope       LegalHoldScope
  ref         String
  reason      String
  createdById String
  createdAt   DateTime       @default(now())
  releasedAt  DateTime?
  @@index([scope, ref, releasedAt])
}

enum DsarSubjectType { consumer tenant }
enum DsarAction { export erase }
enum DsarStatus { pending_verification verified processing completed rejected expired }
model DsarRequest {
  id              String          @id @default(cuid())
  tenantId        String?
  subjectType     DsarSubjectType
  action          DsarAction
  subjectRef      String
  lookupRef       String?
  status          DsarStatus      @default(pending_verification)
  verifyTokenHash String?
  verifyExpiresAt DateTime?
  exportObjectKey String?
  exportExpiresAt DateTime?
  outcomeNote     String?
  requestedAt     DateTime        @default(now())
  completedAt     DateTime?
  @@index([subjectType, subjectRef, requestedAt])
  @@index([status, requestedAt])
}

enum IncidentSeverity { low medium high critical }
enum IncidentStatus { open assessing contained notified closed }
model Incident {
  id                 String           @id @default(cuid())
  title              String
  severity           IncidentSeverity
  status             IncidentStatus   @default(open)
  detectedAt         DateTime
  occurredAt         DateTime?
  dataCategories     String[]
  affectedTenantIds  String[]
  estimatedSubjects  Int?
  ndpcNotifyRequired Boolean?
  ndpcNotifyDeadline DateTime?
  ndpcNotifiedAt     DateTime?
  icoNotifyRequired  Boolean?
  timeline           Json
  postmortemUrl      String?
  openedById         String
  closedAt           DateTime?
  @@index([status, detectedAt])
}
```

- [ ] **Step 4: Generate and apply the migration**

Run: `pnpm --filter @verifynng/db exec prisma migrate dev --name E19_compliance --schema prisma/schema.prisma`

Expected: a new directory under `packages/db/prisma/migrations/` named `<timestamp>_E19_compliance` containing `migration.sql`; command exits 0 and prints "Your database is now in sync with your schema."

If the local Postgres isn't running yet, start the stack first: `docker compose -f docker/compose.yml up -d postgres` and wait for it healthy (`docker compose -f docker/compose.yml ps postgres`).

- [ ] **Step 5: Regenerate the Prisma client**

Run: `pnpm --filter @verifynng/db exec prisma generate --schema prisma/schema.prisma`

Expected: exits 0, "Generated Prisma Client".

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(E19): extend PolicyDocument for legal-doc versioning + add compliance schema"
```

---

## Task 2: Env schema

**Files:**

- Modify: `packages/config/src/env-schema.ts`

- [ ] **Step 1: Add the E19 section**

Insert after the `e14Schema` block (after its closing `});`, before `const ZERO_KEY = ...`):

```ts
// ── E19 Compliance & Data Governance ─────────────────────────────
const e19Schema = z.object({
  CONSENT_SALT: z.string().default('dev-consent-salt'),
  DSAR_EXPORT_TTL_HOURS: z.coerce.number().default(24),
  RETENTION_CRON: z.string().default('0 2 * * *'),
  RETENTION_DRY_RUN_DEFAULT: z.coerce.boolean().default(false),
  DSAR_EXPORT_BUCKET: z.string().default('dsar-exports'),
});
```

- [ ] **Step 2: Merge it into `envSchema`**

Find:

```ts
export const envSchema = e02Schema
  .merge(e06Schema)
  .merge(e17Schema)
  .merge(e14Schema)
  .merge(e13Schema)
  .merge(e04Schema)
  .superRefine((env, ctx) => {
```

Replace with:

```ts
export const envSchema = e02Schema
  .merge(e06Schema)
  .merge(e17Schema)
  .merge(e14Schema)
  .merge(e13Schema)
  .merge(e04Schema)
  .merge(e19Schema)
  .superRefine((env, ctx) => {
```

- [ ] **Step 3: Typecheck the config package**

Run: `pnpm --filter @verifynng/config typecheck`

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/config/src/env-schema.ts
git commit -m "feat(E19): add env vars for consent salt, DSAR export, retention cron"
```

---

## Task 3: `LegalDocumentService` (TDD, real-Postgres integration test)

**Files:**

- Create: `apps/api/src/modules/legal/legal-document.service.ts`
- Test: `apps/api/src/modules/legal/legal-document.service.postgres.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/modules/legal/legal-document.service.postgres.spec.ts`:

```ts
import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
  prisma,
} from '@verifynng/db';
import { NotFoundException } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { LegalDocumentService } from './legal-document.service';

describe('LegalDocumentService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const service = new LegalDocumentService();

  beforeAll(async () => {
    testDb = await createTestDatabase('legal-document');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await dropTestSchema(testDb.schemaName, testDb.prisma);
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  function proxyPrisma() {
    vi.spyOn(prisma.policyDocument, 'findFirst').mockImplementation(((
      args: never,
    ) => testDb.prisma.policyDocument.findFirst(args)) as never);
    vi.spyOn(prisma.policyDocument, 'findMany').mockImplementation(((
      args: never,
    ) => testDb.prisma.policyDocument.findMany(args)) as never);
    vi.spyOn(prisma.policyDocument, 'create').mockImplementation(((
      args: never,
    ) => testDb.prisma.policyDocument.create(args)) as never);
  }

  it('returns the current published version for a kind and translates terms<->tos', async () => {
    proxyPrisma();
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'tos',
        locale: 'en',
        version: '2026-08-01',
        markdown: 'Terms body',
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      },
    });

    const doc = await service.current('terms');
    expect(doc.kind).toBe('terms');
    expect(doc.version).toBe('2026-08-01');
    expect(doc.bodyMd).toBe('Terms body');
    expect(doc.publishedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('never returns a document whose effectiveFrom is in the future', async () => {
    proxyPrisma();
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'privacy',
        locale: 'en',
        version: '1',
        markdown: 'Privacy v1',
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
      },
    });
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'privacy',
        locale: 'en',
        version: '2',
        markdown: 'Privacy v2 (not yet live)',
        effectiveFrom: new Date('2099-01-01T00:00:00Z'),
      },
    });

    const doc = await service.current('privacy');
    expect(doc.version).toBe('1');
  });

  it('throws NotFoundException when no document exists for a kind/locale', async () => {
    proxyPrisma();
    await expect(service.current('cookie', 'fr')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list() returns all published versions, newest first', async () => {
    proxyPrisma();
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'aup',
        locale: 'en',
        version: '2026-08-01',
        markdown: 'AUP v1',
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      },
    });
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'aup',
        locale: 'en',
        version: '2026-09-01',
        markdown: 'AUP v2',
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
      },
    });

    const versions = await service.list('aup');
    expect(versions.map((v) => v.version)).toEqual([
      '2026-09-01',
      '2026-08-01',
    ]);
  });

  it('publish() creates a new row and returns it as a DTO', async () => {
    proxyPrisma();
    const doc = await service.publish({
      kind: 'subprocessors',
      version: '1',
      bodyMd: 'Subprocessor list body',
      publishedById: 'user-support-1',
    });

    expect(doc.kind).toBe('subprocessors');
    expect(doc.version).toBe('1');
    expect(doc.bodyMd).toBe('Subprocessor list body');

    const stored = await testDb.prisma.policyDocument.findFirst({
      where: { kind: 'subprocessors', version: '1' },
    });
    expect(stored?.publishedById).toBe('user-support-1');
    expect(stored?.locale).toBe('en');
    expect(stored?.requiresReacceptance).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api exec vitest run src/modules/legal/legal-document.service.postgres.spec.ts`

Expected: FAIL — `Cannot find module './legal-document.service'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/legal/legal-document.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type { PolicyDocument, PolicyKind } from '@prisma/client';

/**
 * Public, URL-facing document kind. Distinct from the DB's PolicyKind enum
 * because `tos` predates this module's URL contract (`/legal/terms`) — see
 * docs/superpowers/plans/2026-08-30-e19-legal-documents-milestone1.md.
 */
export type LegalDocKind =
  | 'privacy'
  | 'terms'
  | 'aup'
  | 'cookie'
  | 'subprocessors';

export const LEGAL_DOC_KINDS: readonly LegalDocKind[] = [
  'privacy',
  'terms',
  'aup',
  'cookie',
  'subprocessors',
];

const KIND_TO_DB: Record<LegalDocKind, PolicyKind> = {
  privacy: 'privacy',
  terms: 'tos',
  aup: 'aup',
  cookie: 'cookie',
  subprocessors: 'subprocessors',
};

const DB_TO_KIND: Record<PolicyKind, LegalDocKind> = {
  privacy: 'privacy',
  tos: 'terms',
  aup: 'aup',
  cookie: 'cookie',
  subprocessors: 'subprocessors',
};

export interface LegalDocumentDto {
  kind: LegalDocKind;
  version: string;
  locale: string;
  bodyMd: string;
  changeSummary: string | null;
  requiresReacceptance: boolean;
  publishedAt: string;
}

export interface PublishInput {
  kind: LegalDocKind;
  version: string;
  bodyMd: string;
  locale?: string;
  changeSummary?: string;
  requiresReacceptance?: boolean;
  publishedById?: string;
  effectiveFrom?: Date;
}

@Injectable()
export class LegalDocumentService {
  async current(kind: LegalDocKind, locale = 'en'): Promise<LegalDocumentDto> {
    const doc = await prisma.policyDocument.findFirst({
      where: {
        kind: KIND_TO_DB[kind],
        locale,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!doc) throw new NotFoundException('legal_document_not_found');
    return this.toDto(doc);
  }

  async list(kind: LegalDocKind, locale = 'en'): Promise<LegalDocumentDto[]> {
    const docs = await prisma.policyDocument.findMany({
      where: {
        kind: KIND_TO_DB[kind],
        locale,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return docs.map((doc) => this.toDto(doc));
  }

  async publish(input: PublishInput): Promise<LegalDocumentDto> {
    const doc = await prisma.policyDocument.create({
      data: {
        kind: KIND_TO_DB[input.kind],
        locale: input.locale ?? 'en',
        version: input.version,
        markdown: input.bodyMd,
        changeSummary: input.changeSummary,
        requiresReacceptance: input.requiresReacceptance ?? false,
        publishedById: input.publishedById,
        effectiveFrom: input.effectiveFrom ?? new Date(),
      },
    });
    return this.toDto(doc);
  }

  private toDto(doc: PolicyDocument): LegalDocumentDto {
    return {
      kind: DB_TO_KIND[doc.kind],
      version: doc.version,
      locale: doc.locale,
      bodyMd: doc.markdown,
      changeSummary: doc.changeSummary,
      requiresReacceptance: doc.requiresReacceptance,
      publishedAt: doc.effectiveFrom.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter api exec vitest run src/modules/legal/legal-document.service.postgres.spec.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/legal/legal-document.service.ts apps/api/src/modules/legal/legal-document.service.postgres.spec.ts
git commit -m "feat(E19): add LegalDocumentService backed by PolicyDocument"
```

---

## Task 4: `LegalController` + `LegalModule`, wired into `AppModule`

**Files:**

- Create: `apps/api/src/modules/legal/legal.controller.ts`
- Create: `apps/api/src/modules/legal/legal.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the controller**

Create `apps/api/src/modules/legal/legal.controller.ts`:

```ts
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/tenant';
import {
  LEGAL_DOC_KINDS,
  LegalDocKind,
  LegalDocumentService,
} from './legal-document.service';

function assertKind(kind: string): LegalDocKind {
  if (!LEGAL_DOC_KINDS.includes(kind as LegalDocKind)) {
    throw new NotFoundException('legal_document_not_found');
  }
  return kind as LegalDocKind;
}

@Controller('v1/legal')
export class LegalController {
  constructor(private readonly legal: LegalDocumentService) {}

  @Public()
  @Get('subprocessors')
  subprocessors(@Query('locale') locale?: string) {
    return this.legal.current('subprocessors', locale);
  }

  @Public()
  @Get(':kind/versions')
  versions(@Param('kind') kind: string, @Query('locale') locale?: string) {
    return this.legal.list(assertKind(kind), locale);
  }

  @Public()
  @Get(':kind')
  current(@Param('kind') kind: string, @Query('locale') locale?: string) {
    return this.legal.current(assertKind(kind), locale);
  }
}
```

- [ ] **Step 2: Write the module**

Create `apps/api/src/modules/legal/legal.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalDocumentService } from './legal-document.service';

@Module({
  controllers: [LegalController],
  providers: [LegalDocumentService],
  exports: [LegalDocumentService],
})
export class LegalModule {}
```

- [ ] **Step 3: Wire into `AppModule`**

In `apps/api/src/app.module.ts`, add the import line after the `BatchesModule` import:

```ts
import { LegalModule } from './modules/legal/legal.module';
```

And add `LegalModule` to the end of the `imports` array (after `BatchesModule`).

- [ ] **Step 4: Typecheck and build the API**

Run: `pnpm --filter api typecheck && pnpm --filter api build`

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/legal/legal.controller.ts apps/api/src/modules/legal/legal.module.ts apps/api/src/app.module.ts
git commit -m "feat(E19): expose GET /v1/legal/:kind, /v1/legal/:kind/versions, /v1/legal/subprocessors"
```

---

## Task 5: Author the five real legal-document markdown files

**Files:**

- Create: `content/legal/privacy/en.md`
- Create: `content/legal/terms/en.md`
- Create: `content/legal/aup/en.md`
- Create: `content/legal/cookie/en.md`
- Create: `content/legal/subprocessors/en.md`

- [ ] **Step 1: Privacy policy**

Create `content/legal/privacy/en.md`:

```markdown
# Privacy Policy

**Operator:** Tunnel Light Global Concept Ltd ("we", "us"), operating the Verify platform on behalf of participating brands ("tenants").

## What we collect

- **Scan data.** When you scan a product's QR code we record the code scanned, the verification outcome, an approximate location derived from your IP address, and coarse device/browser information. Your IP address is cryptographically hashed at the moment it is received — we never store it in readable form.
- **Report data.** If you report a suspected counterfeit, we collect the details you provide (description, photos) and, only if you choose to give it, a contact email or phone number so we can follow up with you.
- **Tenant account data.** Brands and their staff who use the console provide business, contact, and identity-verification information.

## Why we collect it (lawful basis)

We process scan data under **legitimate interest**: detecting and deterring counterfeit goods protects consumers and the brands we serve, and this interest is not overridden by your privacy rights because the data is minimised (IP hashed on arrival, precise location never stored) and kept only as long as documented in our retention schedule. Report data you submit is processed on the basis of your **consent**, which you may withdraw at any time. Tenant account data is processed to perform our **contract** with the tenant.

## How long we keep it

See `docs/compliance/retention-schedule.md` (published at `/legal/subprocessors` for the subprocessor list and referenced here for completeness). In summary: scan verdicts, tiers, and country are kept indefinitely as anti-counterfeit evidence; city-level location and device details are deleted after 180 days; report photos are deleted after 2 years unless subject to a legal hold.

## Your rights

Under the Nigeria Data Protection Act (NDPA) and, where applicable, the UK GDPR, you may request a copy of your data or its deletion. See our Data Subject Access Request process, available from any report reference, or contact us at **privacy@verifyng.example** (placeholder — see `docs/compliance/data-map.md` for the live contact and NDPC/ICO registration status).

## Subprocessors

We use a small number of subprocessors to operate the platform. The current list is published at `/legal/subprocessors`.

## Changes to this policy

Material changes are versioned; the version and publication date are shown at the top of the rendered page, and previous versions remain available.
```

- [ ] **Step 2: Terms of Service**

Create `content/legal/terms/en.md`:

```markdown
# Terms of Service

These terms govern use of the Verify platform, operated by Tunnel Light Global Concept Ltd.

## For consumers

Verification results are provided for informational purposes to help you assess product authenticity. A "genuine" result reflects that the scanned code matches a code the manufacturer registered with us; it is not a guarantee of product quality, safety, or fitness for purpose.

## For tenants (brands)

By minting codes on the platform you confirm you own or are authorised to use the marks and product identifiers associated with those codes. We may suspend or restrict your account where we have evidence of counterfeiting, fraud, abuse of the platform, or unlawful use, following the process in our Acceptable Use Policy.

## Data collection disclosure

Scan pages collect IP address (hashed on arrival), approximate geographic location, and device/browser information, as described in our Privacy Policy. Tenants must not attempt to identify individual consumers from verification analytics we provide.

## Liability

The platform is provided "as is". To the maximum extent permitted by Nigerian law, we are not liable for indirect or consequential losses arising from reliance on a verification result.

## Governing law

These terms are governed by the laws of the Federal Republic of Nigeria.

## Changes

We will notify tenant account owners when these terms change in a way that requires re-acceptance, and will not gate consumer verification on that acceptance.
```

- [ ] **Step 3: Acceptable Use Policy**

Create `content/legal/aup/en.md`:

```markdown
# Acceptable Use Policy

## You may

- Mint and manage verification codes for products and marks you own or are authorised to represent.
- Use scan and report data provided to you to investigate and respond to suspected counterfeiting.

## You may not

- Mint codes for marks you do not own or represent.
- Attempt to de-anonymise consumers from scan analytics.
- Attempt to circumvent rate limits, scrape the public verification endpoint at scale, or interfere with the integrity of the code-signing system.
- Use consumer contact information collected via reports for marketing without separate, explicit consent recorded through our consent system.

## Enforcement

We may suspend or restrict a tenant account when we have evidence of a violation. Suspension blocks console writes; public consumer verification for that tenant's already-issued codes continues to work, because a brand's policy violation must never read as "counterfeit" to a shopper.

## Reporting a violation

Contact **trust@verifyng.example** (placeholder — see `docs/compliance/data-map.md`) or use the in-console report link.
```

- [ ] **Step 4: Cookie Policy**

Create `content/legal/cookie/en.md`:

```markdown
# Cookie Policy

The consumer-facing verification site (this site) sets **no cookies** and stores nothing in browser local or session storage. This is a tested, enforced property of the platform — see `docs/compliance/data-map.md` and the automated test suite that asserts it on every deploy.

The tenant console (a separate, authenticated application) requires a session and is covered by our Privacy Policy rather than this cookie policy, since session cookies there are strictly necessary for the service to function and are not subject to consent requirements under NDPA/UK PECR-equivalent rules.
```

- [ ] **Step 5: Subprocessors**

Create `content/legal/subprocessors/en.md`:

```markdown
# Subprocessors

We use the following subprocessors to operate the platform. This list is reviewed whenever a subprocessor is added or removed.

| Subprocessor     | Purpose                      | Data                                          | Region                                                                                     |
| ---------------- | ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Resend           | Transactional email delivery | Recipient email address, message content      | US/EU                                                                                      |
| Termii           | SMS delivery                 | Recipient phone number, message content       | Nigeria                                                                                    |
| Paystack         | Payment processing           | Billing contact details, transaction metadata | Nigeria                                                                                    |
| MaxMind          | IP geolocation (approximate) | Hashed IP address                             | Global (processed, not retained by us)                                                     |
| Hosting provider | Application hosting          | All platform data                             | Placeholder — finalised before production launch, tracked in `docs/compliance/data-map.md` |

Full data-processing-agreement status for each subprocessor is tracked in `docs/compliance/data-map.md`.
```

- [ ] **Step 6: Commit**

```bash
git add content/legal
git commit -m "docs(E19): author v1 legal document content (privacy, terms, aup, cookie, subprocessors)"
```

---

## Task 6: Seed the documents from content files

**Files:**

- Create: `packages/db/prisma/seed/legal-documents.ts`
- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Write the seed module**

Create `packages/db/prisma/seed/legal-documents.ts`:

```ts
import type { PolicyKind, PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'content',
  'legal',
);

interface SeedDoc {
  kind: PolicyKind;
  urlSlug: string;
  version: string;
  effectiveFrom: Date;
}

// `aup`/`tos` already have a "2026-08-01" row from seed/policies.ts — this
// upserts that same row with the real authored content rather than adding a
// second version, so each kind still has exactly one "v1". `privacy`,
// `cookie`, `subprocessors` are new and start at version "1".
const DOCS: SeedDoc[] = [
  {
    kind: 'privacy',
    urlSlug: 'privacy',
    version: '1',
    effectiveFrom: new Date('2026-08-30T00:00:00Z'),
  },
  {
    kind: 'tos',
    urlSlug: 'terms',
    version: '2026-08-01',
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
  },
  {
    kind: 'aup',
    urlSlug: 'aup',
    version: '2026-08-01',
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
  },
  {
    kind: 'cookie',
    urlSlug: 'cookie',
    version: '1',
    effectiveFrom: new Date('2026-08-30T00:00:00Z'),
  },
  {
    kind: 'subprocessors',
    urlSlug: 'subprocessors',
    version: '1',
    effectiveFrom: new Date('2026-08-30T00:00:00Z'),
  },
];

export async function seedLegalDocuments(prisma: PrismaClient): Promise<void> {
  for (const doc of DOCS) {
    const markdown = readFileSync(
      join(CONTENT_ROOT, doc.urlSlug, 'en.md'),
      'utf-8',
    );
    await prisma.policyDocument.upsert({
      where: {
        kind_locale_version: {
          kind: doc.kind,
          locale: 'en',
          version: doc.version,
        },
      },
      update: { markdown },
      create: {
        kind: doc.kind,
        locale: 'en',
        version: doc.version,
        markdown,
        effectiveFrom: doc.effectiveFrom,
      },
    });
  }
}
```

- [ ] **Step 2: Confirm the Prisma-generated unique-input name**

Run: `grep -n "kind_locale_version\|kind_version" packages/db/node_modules/.prisma/client/index.d.ts 2>/dev/null | head -5`

Expected: a `PolicyDocumentWhereUniqueInput` type containing `kind_locale_version` (Prisma names composite-unique inputs by joining the field names with `_`, in declaration order — matches the `@@unique([kind, locale, version])` from Task 1). If it instead shows a different generated name, update `legal-documents.ts`'s `where` clause to match exactly what this command prints.

- [ ] **Step 3: Wire the seed into `seed.ts`**

In `packages/db/prisma/seed.ts`, add the import next to the existing `seedPolicies` import:

```ts
import { seedLegalDocuments } from './seed/legal-documents';
```

And add the call right after `await seedPolicies(prisma);` inside `main()`:

```ts
await seedPolicies(prisma);
await seedLegalDocuments(prisma);
```

- [ ] **Step 4: Run the seed against the local stack**

Run: `docker compose -f docker/compose.yml up -d postgres && pnpm --filter @verifynng/db db:seed` (or `pnpm db:seed` from repo root if that's the wired script — check `package.json` for the exact name first with `grep -n '"db:seed"' package.json packages/db/package.json`).

Expected: exits 0, no errors, no stack trace about a missing file (confirms `content/legal/**` paths resolve).

- [ ] **Step 5: Spot-check with psql**

Run: `docker compose -f docker/compose.yml exec -T postgres psql -U postgres -d verifynng -c "select kind, locale, version, \"effectiveFrom\" from \"PolicyDocument\" order by kind;"`

Expected: 5 distinct `kind` values (`aup`, `cookie`, `privacy`, `subprocessors`, `tos`), each with `locale='en'`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/seed/legal-documents.ts packages/db/prisma/seed.ts
git commit -m "feat(E19): seed v1 legal documents from content/legal/**"
```

---

## Task 7: Render `/legal/:kind` on `apps/web-verify`

**Files:**

- Modify: `apps/web-verify/package.json`
- Create: `apps/web-verify/app/legal/[kind]/page.tsx`

- [ ] **Step 1: Add markdown + sanitizer dependencies**

Run: `pnpm --filter web-verify add marked sanitize-html && pnpm --filter web-verify add -D @types/sanitize-html`

Expected: `apps/web-verify/package.json` gains `marked` and `sanitize-html` under `dependencies` and `@types/sanitize-html` under `devDependencies`; lockfile updates; exits 0.

- [ ] **Step 2: Write the page**

Create `apps/web-verify/app/legal/[kind]/page.tsx`:

```tsx
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

const VALID_KINDS = [
  'privacy',
  'terms',
  'aup',
  'cookie',
  'subprocessors',
] as const;
type Kind = (typeof VALID_KINDS)[number];

interface LegalDocument {
  kind: Kind;
  version: string;
  locale: string;
  bodyMd: string;
  changeSummary: string | null;
  publishedAt: string;
}

const TITLES: Record<Kind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  aup: 'Acceptable Use Policy',
  cookie: 'Cookie Policy',
  subprocessors: 'Subprocessors',
};

function isValidKind(kind: string): kind is Kind {
  return (VALID_KINDS as readonly string[]).includes(kind);
}

async function getDocument(kind: Kind): Promise<LegalDocument | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/v1/legal/${kind}`, {
    next: { revalidate },
  });
  if (!res.ok) return null;
  return (await res.json()) as LegalDocument;
}

async function getVersions(kind: Kind): Promise<LegalDocument[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/v1/legal/${kind}/versions`, {
    next: { revalidate },
  });
  if (!res.ok) return [];
  return (await res.json()) as LegalDocument[];
}

export function generateStaticParams() {
  return VALID_KINDS.map((kind) => ({ kind }));
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: rawKind } = await params;
  if (!isValidKind(rawKind)) notFound();
  const kind = rawKind;

  const [doc, versions] = await Promise.all([
    getDocument(kind),
    getVersions(kind),
  ]);
  if (!doc) notFound();

  const html = sanitizeHtml(await marked.parse(doc.bodyMd), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2']),
  });
  const previous = versions.filter((v) => v.version !== doc.version);

  return (
    <main className="mx-auto max-w-3xl p-8 print:p-0">
      <h1 className="text-3xl font-bold">{TITLES[kind]}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Version {doc.version} — published{' '}
        {new Date(doc.publishedAt).toLocaleDateString('en-GB')}
      </p>
      <article
        className="prose mt-6 max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {previous.length > 0 && (
        <section className="mt-10 border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold">Previous versions</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-500">
            {previous.map((v) => (
              <li key={v.version}>
                Version {v.version} —{' '}
                {new Date(v.publishedAt).toLocaleDateString('en-GB')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and build web-verify**

Run: `pnpm --filter web-verify typecheck && pnpm --filter web-verify build`

Expected: both exit 0. The build log should list `/legal/[kind]` as a static/ISR route.

- [ ] **Step 4: Commit**

```bash
git add apps/web-verify/package.json apps/web-verify/app/legal
git commit -m "feat(E19): render /legal/:kind on web-verify"
```

---

## Task 8: Full verification against `docker compose up` (AC1)

- [ ] **Step 1: Bring up the stack**

Run: `docker compose -f docker/compose.yml up -d --build`

Expected: all services healthy. Check with `docker compose -f docker/compose.yml ps`.

- [ ] **Step 2: Seed**

Run: `pnpm db:seed` (repo-root script — confirm exact name first via `grep -n '"db:seed"' package.json`)

Expected: exits 0.

- [ ] **Step 3: Curl the API directly (per AC1)**

Run: `curl -s localhost:4000/v1/legal/privacy | jq .version`

Expected: `"1"` (a string; if AC1's `jq .version → 1` intends a bare number, note the discrepancy in the PR description — the underlying Prisma field is `String` by design, matching the existing `PolicyDocument.version` type E03 already shipped).

Run: `curl -s localhost:4000/v1/legal/terms | jq .`
Run: `curl -s localhost:4000/v1/legal/aup | jq .`
Run: `curl -s localhost:4000/v1/legal/cookie | jq .`
Run: `curl -s localhost:4000/v1/legal/subprocessors | jq .`

Expected: each returns `{ kind, version, locale, bodyMd, changeSummary, requiresReacceptance, publishedAt }` with non-empty `bodyMd`.

- [ ] **Step 4: Check the rendered pages**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/legal/privacy`
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/legal/terms`
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/legal/aup`
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/legal/cookie`
Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/legal/subprocessors`

(substitute the worktree's actual web-verify port from `scripts/epic ports E19` instead of 3000/4000 if running from this worktree, not the main checkout)

Expected: `200` for each.

- [ ] **Step 5: Run the full pre-push gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: all green.

- [ ] **Step 6: Record evidence**

Copy the exact terminal output of steps 3–5 into the PR description and into a comment on GitHub issue #20, per AGENTS.md's Definition of Done (criterion 3: "Every acceptance criterion... demonstrated from a fresh clone and the command output is pasted as a comment on the epic's GitHub issue").

---

## Task 9: Open the PR

- [ ] **Step 1: Rebase on `main`**

Run: `git fetch origin && git rebase origin/main`

- [ ] **Step 2: Push**

Run: `git push -u origin epic/E19-compliance-data-governance`

- [ ] **Step 3: Open the PR** (title carries the epic id, per AGENTS.md)

```
gh pr create --title "feat(E19): legal document publishing (AC1)" --base main --body "$(cat <<'EOF'
## Summary
- Extends the existing PolicyDocument/PolicyAcceptance models (built ahead of schedule by E00/E03) additively for legal-document versioning, rather than duplicating a LegalDocument model — see docs/superpowers/plans/2026-08-30-e19-legal-documents-milestone1.md "Key decisions".
- Adds the full E19 Prisma schema (ConsentRecord, RetentionRun, LegalHold, DsarRequest, Incident) in this one migration per the schema.prisma hot-spot rule; only LegalDocument-related code is wired up in this PR, the rest lands in later E19 PRs.
- Ships GET /v1/legal/:kind, /v1/legal/:kind/versions, /v1/legal/subprocessors and renders them at /legal/:kind on web-verify.
- Seeds real v1 content for privacy/terms/aup/cookie/subprocessors from content/legal/**.

Closes AC1 of #20. Remaining E19 tasks (T4-T15) tracked in the issue checklist and follow in subsequent PRs.

## Test plan
- [ ] pnpm lint && pnpm typecheck && pnpm test && pnpm build — all green (output pasted below)
- [ ] docker compose up, pnpm db:seed, curl evidence for all 5 /v1/legal/:kind routes and all 5 /legal/:kind pages — pasted below and on issue #20
EOF
)"
```

- [ ] **Step 4: Comment the evidence on issue #20**

```
gh issue comment 20 --body "$(cat <<'EOF'
## AC1 evidence — legal document publishing

<paste the exact output from Task 8 steps 3-5 here>
EOF
)"
```

Do **not** merge this PR — per this epic's working agreement, the orchestrator reviews and merges.

---

## Self-review notes (from the plan author)

- **Spec coverage:** this plan covers exactly AC1. T1's schema/migration scope is done in full (all 5 new models land now); T1's module-scaffold scope is done only for `LegalModule` — `ConsentModule`/`RetentionModule`/`DsarModule`/`IncidentsModule` are deliberately deferred to the plans that implement their first real task, to avoid landing empty placeholder modules. T2's authoring UI, T3's "previous versions" locale-`t()` integration (no `t()` exists yet — E09 hasn't landed), and T4-T15 are out of scope and tracked in the epic file's own checklist for follow-up plans.
- **Placeholder scan:** no TBD/TODO/"add error handling" left in any step; every code block is complete and copy-pasteable.
- **Type consistency:** `LegalDocKind`, `LegalDocumentDto`, `PublishInput` are defined once in `legal-document.service.ts` and imported everywhere else (`legal.controller.ts`) rather than redefined.
