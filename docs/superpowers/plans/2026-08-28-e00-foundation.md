# E00 Foundation & Dev Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A monorepo where `pnpm install && docker compose up` brings up the full local dev stack with healthy services, CI that lints/typechecks/tests/builds, and an extensible skeleton for all other epics.

**Architecture:** pnpm workspaces + Turborepo monorepo. NestJS 11 API with health endpoint, Next.js 15 apps with placeholder pages, Prisma 6 with base schema, Zod-validated env config, Docker Compose stack with Postgres/Redis/MinIO/Mailpit/fakes, Vitest + Playwright testing, GitHub Actions CI.

**Tech Stack:** Node 22 LTS, pnpm 9, NestJS 11.2, Prisma 6.19, Next.js 15.5, Vitest 4, Playwright 1.62, Turborepo 2.10, Tailwind CSS 4

---

## Pinned versions

| Package | Version |
|---|---|
| `@nestjs/core`, `@nestjs/platform-express` | 11.2.3 |
| `@nestjs/cli` | 11.0.24 |
| `next` | 15.5.24 |
| `prisma`, `@prisma/client` | 6.19.3 |
| `turbo` | 2.10.12 |
| `vitest` | 4.1.11 |
| `@playwright/test` | 1.62.1 |
| `zod` | latest (3.x) |

---

## File structure (all paths relative to repo root)

```
.nvmrc
.editorconfig
package.json                          # root: scripts, devDeps
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
.eslintrc.cjs                         # root ESLint
.prettierrc
.husky/pre-commit
lint-staged.config.cjs

packages/config/
  package.json
  tsconfig.json
  src/index.ts                        # loadEnv(), Env type
  src/env-schema.ts                   # Zod schemas

packages/db/
  package.json
  tsconfig.json
  prisma/schema.prisma
  prisma/seed.ts
  src/index.ts                        # prisma singleton, createTestDatabase

apps/api/
  package.json
  tsconfig.json
  nest-cli.json
  Dockerfile
  src/main.ts
  src/app.module.ts
  src/health/health.module.ts
  src/health/health.controller.ts
  src/health/health.service.ts
  src/health/prisma.health.ts
  src/health/redis.health.ts
  src/common/request-id.middleware.ts
  src/common/tenant-id.decorator.ts

apps/web-verify/
  package.json
  next.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.mjs
  Dockerfile
  app/layout.tsx
  app/page.tsx
  app/api/health/route.ts

apps/web-admin/
  package.json
  next.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.mjs
  Dockerfile
  app/layout.tsx
  app/page.tsx
  app/api/health/route.ts

tools/fakes/sms/
  Dockerfile
  server.mjs

tools/fakes/pay/
  Dockerfile
  server.mjs

tools/fakes/geo/
  Dockerfile
  server.mjs

docker/
  compose.yml
  compose.dev.yml
  Dockerfile.api
  Dockerfile.web-verify
  Dockerfile.web-admin

vitest.workspace.ts
playwright.config.ts
.github/workflows/ci.yml
.env.example
CONTRIBUTING.md
```

---

## Task 1: Claim epic + init monorepo

**Files:**
- Modify: `docs/epics/E00-foundation.md` (Owner + Status)
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `lint-staged.config.cjs`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/web-verify/package.json`
- Create: `apps/web-verify/tsconfig.json`
- Create: `apps/web-admin/package.json`
- Create: `apps/web-admin/tsconfig.json`

### Step 1: Claim GitHub issue #1

```bash
cd /Users/frank.enendu/Documents/Contract/Tunnel\ Light/verifynNG-E00
gh issue edit 1 -R enendufrankc/verifynNG --add-assignee enendufrankc
```

### Step 2: Update epic file Owner and Status

Edit `docs/epics/E00-foundation.md`: change `Status | todo` → `Status | in-progress` and `Owner | —` → `Owner | enendufrankc`.

Commit and push to the branch, then PR to main.

### Step 3: Create `.nvmrc`

```
22
```

### Step 4: Create root `package.json`

```json
{
  "name": "verifynng",
  "private": true,
  "packageManager": "pnpm@9.15.9",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:e2e": "playwright test",
    "db:migrate": "pnpm --filter @verifynng/db db:migrate",
    "db:reset": "pnpm --filter @verifynng/db db:reset",
    "db:seed": "pnpm --filter @verifynng/db db:seed",
    "prepare": "husky"
  },
  "devDependencies": {
    "@eslint/js": "9.35.0",
    "eslint": "9.35.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-import": "2.32.0",
    "eslint-plugin-simple-import-sort": "12.1.1",
    "husky": "9.1.7",
    "lint-staged": "16.1.6",
    "prettier": "3.6.2",
    "prettier-plugin-tailwindcss": "0.7.1",
    "turbo": "2.10.12",
    "typescript": "5.9.2"
  }
}
```

### Step 5: Create `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Step 6: Create `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Step 7: Create `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Step 8: Create `.editorconfig`

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

### Step 9: Create `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 80,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### Step 10: Create `lint-staged.config.cjs`

```js
module.exports = {
  '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
```

### Step 11: Create workspace package.json files

`packages/config/package.json`:
```json
{
  "name": "@verifynng/config",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "3.25.76"
  },
  "devDependencies": {
    "typescript": "5.9.2"
  }
}
```

`packages/db/package.json`:
```json
{
  "name": "@verifynng/db",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./prisma-client": "./src/prisma-client.ts"
  },
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:migrate": "prisma migrate deploy",
    "db:reset": "prisma migrate reset --force",
    "db:seed": "prisma db seed",
    "prisma:generate": "prisma generate",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "6.19.3"
  },
  "devDependencies": {
    "prisma": "6.19.3",
    "typescript": "5.9.2",
    "vitest": "4.1.11"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

`apps/api/package.json`:
```json
{
  "name": "@verifynng/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "nest start",
    "start:prod": "node dist/main",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@nestjs/common": "11.2.3",
    "@nestjs/core": "11.2.3",
    "@nestjs/platform-express": "11.2.3",
    "@nestjs/config": "11.0.2",
    "@nestjs/terminus": "11.0.0",
    "@verifynng/config": "workspace:*",
    "@verifynng/db": "workspace:*",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "ioredis": "5.7.0",
    "uuid": "11.1.0"
  },
  "devDependencies": {
    "@nestjs/cli": "11.0.24",
    "@nestjs/schematics": "11.0.2",
    "@types/express": "5.0.3",
    "@types/uuid": "10.0.0",
    "typescript": "5.9.2",
    "vitest": "4.1.11"
  }
}
```

`apps/web-verify/package.json`:
```json
{
  "name": "@verifynng/web-verify",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.5.24",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@types/node": "22.18.1",
    "@types/react": "19.1.9",
    "@types/react-dom": "19.1.9",
    "typescript": "5.9.2",
    "tailwindcss": "4.1.11",
    "@tailwindcss/postcss": "4.1.11"
  }
}
```

`apps/web-admin/package.json`:
```json
{
  "name": "@verifynng/web-admin",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "15.5.24",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@types/node": "22.18.1",
    "@types/react": "19.1.9",
    "@types/react-dom": "19.1.9",
    "typescript": "5.9.2",
    "tailwindcss": "4.1.11",
    "@tailwindcss/postcss": "4.1.11"
  }
}
```

### Step 12: Create workspace tsconfig.json files

Each workspace package extends the base. `packages/config/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`packages/db/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS",
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "target": "ES2022",
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src"]
}
```

`apps/web-verify/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./app/*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "app", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`apps/web-admin/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./app/*"]
    },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "app", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### Step 13: Install dependencies

```bash
pnpm install
```

### Step 14: Set up Husky

```bash
pnpm exec husky init
echo 'pnpm exec lint-staged' > .husky/pre-commit
```

### Step 15: Commit

```bash
git add -A
git commit -m "feat(E00): init monorepo scaffold"
```

---

## Task 2: packages/config — Zod env schema + loadEnv

**Files:**
- Create: `packages/config/src/env-schema.ts`
- Create: `packages/config/src/index.ts`
- Create: `.env.example`

### Step 1: Create `packages/config/src/env-schema.ts`

```typescript
import { z } from 'zod';

// ── E00 Foundation ──────────────────────────────────────────────
const e00Schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().url().default(
    'postgresql://verifynng:verifynng@localhost:5432/verifynng?schema=public',
  ),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().default(4000),
  // MinIO / S3
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('verifynng'),
  // SMTP (Mailpit)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  // Next.js
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4000'),
});

// ── Sections for other epics will be added here ────────────────
// E02 will add JWT_SECRET, etc.
// E14 will add EMAIL_FROM, etc.

export const envSchema = e00Schema;

export type Env = z.infer<typeof envSchema>;
```

### Step 2: Create `packages/config/src/index.ts`

```typescript
export { envSchema, type Env } from './env-schema.js';

import { envSchema, type Env } from './env-schema.js';

let _env: Env | undefined;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([key, vals]) => `${key}: ${vals?.join(', ')}`)
      .join('\n  ');
    throw new Error(`Environment validation failed:\n  ${message}`);
  }
  _env = result.data;
  return _env;
}
```

### Step 3: Create `.env.example`

```
# ── E00 Foundation ──────────────────────────────────────────
NODE_ENV=development
DATABASE_URL=postgresql://verifynng:verifynng@localhost:5432/verifynng?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4000

# MinIO / S3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=verifynng

# SMTP (Mailpit)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Step 4: Commit

```bash
git add -A
git commit -m "feat(E00): add packages/config with Zod env schema"
```

---

## Task 3: packages/db — Prisma schema, client, seed, test helpers

**Files:**
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/seed.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/prisma-client.ts`
- Create: `packages/db/src/test-helpers.ts`

### Step 1: Create `packages/db/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── E00 Base models ─────────────────────────────────────────────

enum TenantStatus {
  pending
  active
  suspended
  offboarded
}

enum UnitState {
  active
  flagged
  decommissioned
}

model Tenant {
  id        String       @id @default(cuid())
  slug      String       @unique
  name      String
  legalName String?
  status    TenantStatus @default(pending)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  users     User[]
  products  Product[]
  oems      Oem[]
  batches   Batch[]
  units     Unit[]
  scanEvents ScanEvent[]
  auditLogs AuditLog[]
}

model User {
  id           String   @id @default(cuid())
  tenantId     String?
  email        String   @unique
  passwordHash String?
  displayName  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant Tenant? @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}

model Product {
  id        String   @id @default(cuid())
  tenantId  String
  sku       String
  name      String
  gtin      String?
  createdAt DateTime @default(now())

  tenant Tenant  @relation(fields: [tenantId], references: [id])
  batches Batch[]

  @@unique([tenantId, sku])
  @@index([tenantId])
}

model Oem {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  country   String?
  createdAt DateTime @default(now())

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  batches Batch[]

  @@index([tenantId])
}

model Batch {
  id        String   @id @default(cuid())
  tenantId  String
  productId String
  oemId     String?
  count     Int
  status    String
  createdAt DateTime @default(now())

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  product Product @relation(fields: [productId], references: [id])
  oem     Oem?    @relation(fields: [oemId], references: [id])
  units   Unit[]

  @@index([tenantId])
}

model Unit {
  id         String     @id @default(cuid())
  tenantId   String
  batchId    String
  tier1Code  String     @unique
  tier2Hash  String     @unique
  state      UnitState  @default(active)
  createdAt  DateTime   @default(now())

  tenant    Tenant      @relation(fields: [tenantId], references: [id])
  batch     Batch       @relation(fields: [batchId], references: [id])
  scanEvents ScanEvent[]

  @@index([tenantId])
}

model ScanEvent {
  id          String   @id @default(cuid())
  tenantId    String
  unitId      String?
  tier        Int
  verdict     String
  ip          String?
  geoCountry  String?
  geoCity     String?
  userAgent   String?
  createdAt   DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  unit   Unit?  @relation(fields: [unitId], references: [id])

  @@index([tenantId])
  @@index([unitId])
}

model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String?
  actorId   String?
  action    String
  target    String
  payload   Json
  prevHash  String?
  hash      String
  createdAt DateTime @default(now())

  tenant Tenant? @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}
```

### Step 2: Create `packages/db/src/prisma-client.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### Step 3: Create `packages/db/src/test-helpers.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const rootPrisma = new PrismaClient();

/**
 * Creates an isolated test database schema, runs migrations, and returns
 * a PrismaClient pointed at that schema. Callers should call
 * `testDb.disconnect()` in their afterAll hook.
 */
export async function createTestDatabase(
  testFilePath?: string,
): Promise<{ prisma: PrismaClient; schemaName: string }> {
  const slug = testFilePath
    ? testFilePath
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()
        .slice(0, 40)
    : `test_${Date.now()}`;
  const schemaName = `test_${slug}_${process.pid}`;

  await rootPrisma.$executeRawUnsafe(
    `CREATE SCHEMA "${schemaName}"`,
  );

  const testDatabaseUrl = process.env.DATABASE_URL!.replace(
    /\?schema=public/,
    `?schema=${schemaName}`,
  );

  // Run migrations against the test schema
  execSync(
    `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`,
    {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'pipe',
    },
  );

  const testPrisma = new PrismaClient({
    datasources: {
      db: { url: testDatabaseUrl },
    },
  });

  return {
    prisma: testPrisma,
    schemaName,
  };
}

/**
 * Drops the test schema and disconnects. Call in afterAll.
 */
export async function dropTestSchema(
  schemaName: string,
  testPrisma: PrismaClient,
): Promise<void> {
  await testPrisma.$disconnect();
  await rootPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Disconnect the root helper client (call once at the very end of the test run).
 */
export async function disconnectTestHelper(): Promise<void> {
  await rootPrisma.$disconnect();
}
```

### Step 4: Create `packages/db/src/index.ts`

```typescript
export { prisma } from './prisma-client.js';
export { createTestDatabase, dropTestSchema, disconnectTestHelper } from './test-helpers.js';
```

### Step 5: Create `packages/db/prisma/seed.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create the ivoryglow tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ivoryglow' },
    update: {},
    create: {
      slug: 'ivoryglow',
      name: 'IVORY GLOW',
      legalName: 'Tunnel Light Global Concept Ltd',
      status: 'active',
    },
  });

  // Create the three IVORY GLOW products (from legacy/verify-platform/cli.js)
  const products = [
    { sku: 'ig004', name: 'IVORY GLOW Turmeric & Curcumin Shower Gel 1000ml' },
    { sku: 'ig005', name: 'IVORY GLOW Retinol & Amino Acids Shower Gel 1000ml' },
    {
      sku: 'ig006',
      name: 'IVORY GLOW Vitamin C & B3 Shower Gel + Collagen Peptide 24 1000ml',
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        sku: p.sku,
        name: p.name,
      },
    });
  }

  console.log(`Seeded tenant ${tenant.name} with ${products.length} products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Step 6: Run prisma generate

```bash
cd packages/db && pnpm prisma generate
```

### Step 7: Commit

```bash
git add -A
git commit -m "feat(E00): add packages/db with Prisma schema, client, seed"
```

---

## Task 4: apps/api — NestJS skeleton with health, config, prisma

**Files:**
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.service.ts`
- Create: `apps/api/src/health/prisma.health.ts`
- Create: `apps/api/src/health/redis.health.ts`
- Create: `apps/api/src/common/request-id.middleware.ts`
- Create: `apps/api/src/common/tenant-id.decorator.ts`

### Step 1: Create `apps/api/nest-cli.json`

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

### Step 2: Create `apps/api/src/main.ts`

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from '@verifynng/config';

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

### Step 3: Create `apps/api/src/common/request-id.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    req.headers['x-request-id'] =
      (req.headers['x-request-id'] as string) || uuidv4();
    next();
  }
}
```

### Step 4: Create `apps/api/src/common/tenant-id.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Placeholder decorator — E02 will back this with real auth.
 * Currently returns a hardcoded value for development.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): string => {
    return 'ivoryglow'; // placeholder until E02 ships auth
  },
);
```

### Step 5: Create `apps/api/src/health/prisma.health.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { prisma } from '@verifynng/db';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch {
      return this.getStatus(key, false);
    }
  }
}
```

### Step 6: Create `apps/api/src/health/redis.health.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const env = loadEnv();
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
    try {
      await redis.connect();
      await redis.ping();
      return this.getStatus(key, true);
    } catch {
      return this.getStatus(key, false);
    } finally {
      await redis.quit();
    }
  }
}
```

### Step 7: Create `apps/api/src/health/health.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private redisHealth: RedisHealthIndicator,
  ) {}

  check() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('db'),
      () => this.redisHealth.isHealthy('redis'),
    ]);
  }
}
```

### Step 8: Create `apps/api/src/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheckResult } from '@nestjs/terminus';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  check(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }
}
```

### Step 9: Create `apps/api/src/health/health.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthService, PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
```

### Step 10: Create `apps/api/src/app.module.ts`

```typescript
import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv, envSchema } from '@verifynng/config';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    HealthModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

### Step 11: Commit

```bash
git add -A
git commit -m "feat(E00): add NestJS API skeleton with health endpoint"
```

---

## Task 5: Next.js skeleton apps

**Files:**
- Create: `apps/web-verify/next.config.ts`
- Create: `apps/web-verify/postcss.config.mjs`
- Create: `apps/web-verify/app/layout.tsx`
- Create: `apps/web-verify/app/page.tsx`
- Create: `apps/web-verify/app/globals.css`
- Create: `apps/web-verify/app/api/health/route.ts`
- Create: `apps/web-admin/next.config.ts`
- Create: `apps/web-admin/postcss.config.mjs`
- Create: `apps/web-admin/app/layout.tsx`
- Create: `apps/web-admin/app/page.tsx`
- Create: `apps/web-admin/app/globals.css`
- Create: `apps/web-admin/app/api/health/route.ts`

### Step 1: Create `apps/web-verify/next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

### Step 2: Create `apps/web-verify/postcss.config.mjs`

```javascript
export default {
  plugins: ['@tailwindcss/postcss'],
};
```

### Step 3: Create `apps/web-verify/app/globals.css`

```css
@import 'tailwindcss';
```

### Step 4: Create `apps/web-verify/app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verify — Product Authenticity',
  description: 'Scan a QR code to verify your product',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

### Step 5: Create `apps/web-verify/app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/health`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: 'error', api: 'unreachable' },
      { status: 503 },
    );
  }
}
```

### Step 6: Create `apps/web-verify/app/page.tsx`

```tsx
export const dynamic = 'force-dynamic';

async function getHealthStatus() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/health`, { cache: 'no-store' });
    return await res.json();
  } catch {
    return { status: 'error' };
  }
}

export default async function Home() {
  const health = await getHealthStatus();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">Verify</h1>
      <p className="mt-4 text-lg text-gray-600">
        Product authenticity verification
      </p>
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-500">API Status</p>
        <p className="mt-1 text-2xl font-semibold">
          {health.status === 'ok' ? '✓ OK' : '✗ Down'}
        </p>
        {health.details && (
          <div className="mt-3 space-y-1 text-sm text-gray-500">
            {Object.entries(health.details).map(([key, val]: [string, any]) => (
              <p key={key}>
                {key}:{' '}
                <span
                  className={
                    val.status === 'up'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {val.status}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

### Step 7: Create `apps/web-admin/next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

### Step 8: Create `apps/web-admin/postcss.config.mjs`

```javascript
export default {
  plugins: ['@tailwindcss/postcss'],
};
```

### Step 9: Create `apps/web-admin/app/globals.css`

```css
@import 'tailwindcss';
```

### Step 10: Create `apps/web-admin/app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verify Admin — Tenant Console',
  description: 'Manage your product authenticity programme',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

### Step 11: Create `apps/web-admin/app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/health`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: 'error', api: 'unreachable' },
      { status: 503 },
    );
  }
}
```

### Step 12: Create `apps/web-admin/app/page.tsx`

```tsx
export const dynamic = 'force-dynamic';

async function getHealthStatus() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiUrl}/health`, { cache: 'no-store' });
    return await res.json();
  } catch {
    return { status: 'error' };
  }
}

export default async function Home() {
  const health = await getHealthStatus();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">Verify Admin</h1>
      <p className="mt-4 text-lg text-gray-600">Tenant console</p>
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-500">API Status</p>
        <p className="mt-1 text-2xl font-semibold">
          {health.status === 'ok' ? '✓ OK' : '✗ Down'}
        </p>
        {health.details && (
          <div className="mt-3 space-y-1 text-sm text-gray-500">
            {Object.entries(health.details).map(([key, val]: [string, any]) => (
              <p key={key}>
                {key}:{' '}
                <span
                  className={
                    val.status === 'up'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {val.status}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

### Step 13: Commit

```bash
git add -A
git commit -m "feat(E00): add Next.js skeleton apps"
```

---

## Task 6: Docker Compose + fake services + Dockerfiles

**Files:**
- Create: `docker/compose.yml`
- Create: `docker/compose.dev.yml`
- Create: `docker/Dockerfile.api`
- Create: `docker/Dockerfile.web-verify`
- Create: `docker/Dockerfile.web-admin`
- Create: `tools/fakes/sms/Dockerfile`
- Create: `tools/fakes/sms/server.mjs`
- Create: `tools/fakes/pay/Dockerfile`
- Create: `tools/fakes/pay/server.mjs`
- Create: `tools/fakes/geo/Dockerfile`
- Create: `tools/fakes/geo/server.mjs`

### Step 1: Create `tools/fakes/sms/server.mjs`

```javascript
import { createServer } from 'node:http';

const PORT = 4101;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-sms' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'msg_stub', status: 'sent' }));
});

server.listen(PORT, () => {
  console.log(`fake-sms listening on :${PORT}`);
});
```

### Step 2: Create `tools/fakes/sms/Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
EXPOSE 4101
CMD ["node", "server.mjs"]
```

### Step 3: Create `tools/fakes/pay/server.mjs`

```javascript
import { createServer } from 'node:http';

const PORT = 4102;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-pay' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'pay_stub', status: 'success' }));
});

server.listen(PORT, () => {
  console.log(`fake-pay listening on :${PORT}`);
});
```

### Step 4: Create `tools/fakes/pay/Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
EXPOSE 4102
CMD ["node", "server.mjs"]
```

### Step 5: Create `tools/fakes/geo/server.mjs`

```javascript
import { createServer } from 'node:http';

const PORT = 4103;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-geo' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ country: 'NG', city: 'Lagos' }));
});

server.listen(PORT, () => {
  console.log(`fake-geo listening on :${PORT}`);
});
```

### Step 6: Create `tools/fakes/geo/Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
EXPOSE 4103
CMD ["node", "server.mjs"]
```

### Step 7: Create `docker/Dockerfile.api`

```dockerfile
# ── Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/config/ packages/config/
COPY packages/db/ packages/db/
COPY apps/api/ apps/api/
COPY tsconfig.base.json ./

RUN pnpm --filter @verifynng/db prisma:generate
RUN pnpm --filter @verifynng/api build

# ── Production stage ───────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/packages/db/prisma ./prisma

USER appuser
EXPOSE 4000

CMD ["node", "dist/main.js"]
```

### Step 8: Create `docker/Dockerfile.web-verify`

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web-verify/package.json apps/web-verify/

RUN pnpm install --frozen-lockfile

COPY apps/web-verify/ apps/web-verify/
COPY tsconfig.base.json ./

RUN pnpm --filter @verifynng/web-verify build

# ── Production stage ───────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/web-verify/.next/standalone ./
COPY --from=builder /app/apps/web-verify/.next/static ./apps/web-verify/.next/static
COPY --from=builder /app/apps/web-verify/public ./apps/web-verify/public 2>/dev/null || true

USER appuser
EXPOSE 3000

ENV PORT=3000
CMD ["node", "apps/web-verify/server.js"]
```

### Step 9: Create `docker/Dockerfile.web-admin`

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web-admin/package.json apps/web-admin/

RUN pnpm install --frozen-lockfile

COPY apps/web-admin/ apps/web-admin/
COPY tsconfig.base.json ./

RUN pnpm --filter @verifynng/web-admin build

# ── Production stage ───────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/web-admin/.next/standalone ./
COPY --from=builder /app/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=builder /app/apps/web-admin/public ./apps/web-admin/public 2>/dev/null || true

USER appuser
EXPOSE 3001

ENV PORT=3001
CMD ["node", "apps/web-admin/server.js"]
```

### Step 10: Create `docker/compose.yml`

```yaml
services:
  # ── Infrastructure ────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: verifynng
      POSTGRES_PASSWORD: verifynng
      POSTGRES_DB: verifynng
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U verifynng"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb local/verifynng || true;
      "

  mailpit:
    image: axllent/mailpit
    ports:
      - "8025:8025"
      - "1025:1025"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8025"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ── Fake external services ────────────────────────────────
  fake-sms:
    build:
      context: ../tools/fakes/sms
      dockerfile: Dockerfile
    ports:
      - "4101:4101"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4101/health"]
      interval: 5s
      timeout: 5s
      retries: 5

  fake-pay:
    build:
      context: ../tools/fakes/pay
      dockerfile: Dockerfile
    ports:
      - "4102:4102"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4102/health"]
      interval: 5s
      timeout: 5s
      retries: 5

  fake-geo:
    build:
      context: ../tools/fakes/geo
      dockerfile: Dockerfile
    ports:
      - "4103:4103"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4103/health"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ── Application services ──────────────────────────────────
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://verifynng:verifynng@postgres:5432/verifynng?schema=public
      REDIS_URL: redis://redis:6379
      API_PORT: "4000"
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
      S3_BUCKET: verifynng
      SMTP_HOST: mailpit
      SMTP_PORT: "1025"
      NEXT_PUBLIC_API_URL: http://localhost:4000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  web-verify:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web-verify
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://api:4000
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  web-admin:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web-admin
    ports:
      - "3001:3001"
    environment:
      NEXT_PUBLIC_API_URL: http://api:4000
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/api/health"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### Step 11: Create `docker/compose.dev.yml`

```yaml
# Dev override: bind mounts, hot reload, source-mapped debug
services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    volumes:
      - ../apps/api/src:/app/dist:ro
    environment:
      NODE_ENV: development

  web-verify:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web-verify
    volumes:
      - ../apps/web-verify/app:/app/apps/web-verify/app:ro
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:4000

  web-admin:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web-admin
    volumes:
      - ../apps/web-admin/app:/app/apps/web-admin/app:ro
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:4000
```

### Step 12: Commit

```bash
git add -A
git commit -m "feat(E00): add Docker Compose stack, Dockerfiles, and fake services"
```

---

## Task 7: Test tooling — Vitest workspace, integration test, Playwright

**Files:**
- Create: `vitest.workspace.ts`
- Create: `packages/db/src/test-helpers.test.ts`
- Create: `playwright.config.ts`
- Create: `e2e/web-verify.spec.ts`
- Create: `e2e/web-admin.spec.ts`

### Step 1: Create `vitest.workspace.ts`

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/config/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'apps/api/vitest.config.ts',
]);
```

### Step 2: Create `packages/db/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

### Step 3: Create `packages/config/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

### Step 4: Create `apps/api/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
  },
});
```

### Step 5: Create `packages/db/src/test-helpers.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from './test-helpers';

// This test requires DATABASE_URL pointing at a running Postgres
describe('createTestDatabase', () => {
  let result: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    result = await createTestDatabase('helpers-test');
  });

  afterAll(async () => {
    await dropTestSchema(result.schemaName, result.prisma);
    await disconnectTestHelper();
  });

  it('creates a schema and returns a working PrismaClient', async () => {
    expect(result.schemaName).toMatch(/^test_helpers_test_/);
    // Can query the isolated schema
    const count = await result.prisma.tenant.count();
    expect(count).toBe(0);
  });

  it('isolates data between schemas', async () => {
    // Insert in test schema
    await result.prisma.tenant.create({
      data: { slug: 'test-1', name: 'Test', status: 'pending' },
    });
    const count = await result.prisma.tenant.count();
    expect(count).toBe(1);
  });
});
```

### Step 6: Create `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'web-verify',
      use: { baseURL: 'http://localhost:3000' },
    },
    {
      name: 'web-admin',
      use: { baseURL: 'http://localhost:3001' },
    },
  ],
});
```

### Step 7: Create `e2e/web-verify.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('web-verify smoke', () => {
  test('loads and shows API status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Verify');
    await expect(page.getByText(/ok|down/i)).toBeVisible({ timeout: 15_000 });
  });
});
```

### Step 8: Create `e2e/web-admin.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('web-admin smoke', () => {
  test('loads and shows API status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Verify Admin');
    await expect(page.getByText(/ok|down/i)).toBeVisible({ timeout: 15_000 });
  });
});
```

### Step 9: Commit

```bash
git add -A
git commit -m "feat(E00): add Vitest workspace, integration test, Playwright smoke tests"
```

---

## Task 8: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

### Step 1: Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: verifynng
          POSTGRES_PASSWORD: verifynng
          POSTGRES_DB: verifynng
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://verifynng:verifynng@localhost:5432/verifynng?schema=public
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @verifynng/db db:migrate
      - run: pnpm test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  compose-config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate compose config
        run: docker compose -f docker/compose.yml config

  # ── Placeholder slots for E21 ─────────────────────────────
  # isolation-matrix:
  # openapi-check:
  # seed-lint:
  # test:smoke:
```

### Step 2: Commit

```bash
git add -A
git commit -m "feat(E00): add GitHub Actions CI pipeline"
```

---

## Task 9: Docs — AGENTS.md, CONTRIBUTING.md, README.md quickstart

**Files:**
- Modify: `AGENTS.md` (update Commands section)
- Create: `CONTRIBUTING.md`
- Modify: `README.md` (quickstart section)

### Step 1: Update `AGENTS.md` Commands section

Replace the placeholder commands with the real ones:

```
## Commands

```
pnpm install
docker compose -f docker/compose.yml up -d     # full local stack
pnpm dev                                        # turbo dev across apps
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e
pnpm db:migrate | db:reset | db:seed
```
```

### Step 2: Create `CONTRIBUTING.md`

```markdown
# Contributing to verifynNG

## Prerequisites

- Node.js 22 LTS (use `.nvmrc`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker & Docker Compose

## Getting started

```bash
pnpm install
docker compose -f docker/compose.yml up -d
pnpm db:migrate
pnpm db:seed        # creates ivoryglow tenant + 3 products
```

## Worktree flow

Each epic gets its own worktree and branch:

```bash
git worktree add ../verifynNG-EXX -b epic/EXX-<slug> main
# or use: scripts/epic start EXX
```

## PR checklist

- [ ] Branch name follows `epic/EXX-<slug>` convention
- [ ] Conventional commit: `feat(E06): description`
- [ ] PR title carries the epic id
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green
- [ ] `docker compose config` validates
- [ ] No changes outside owned paths (or hot-spot rules followed)
- [ ] Additive-only changes to `schema.prisma`
- [ ] No `.env*` committed (except `.env.example`)
- [ ] Tests cover new logic; integration tests hit real Postgres

## Commit conventions

- Format: `type(scope): description`
- Scope is the epic id: `feat(E06): tier-2 verdict engine`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`
```

### Step 3: Update root `README.md` with quickstart

Add a Quickstart section after the existing content showing the exact commands.

### Step 4: Commit

```bash
git add -A
git commit -m "docs(E00): update AGENTS.md commands, add CONTRIBUTING.md"
```

---

## Task 10: First migration, smoke test, AC verification

**Files:**
- None new — run commands and verify

### Step 1: Generate the first Prisma migration

```bash
cd packages/db && npx prisma migrate dev --name E00_base
```

### Step 2: Verify `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green

### Step 3: `docker compose -f docker/compose.yml up -d` and wait for healthy

```bash
docker compose -f docker/compose.yml up -d --build
docker compose -f docker/compose.yml ps  # all healthy
```

### Step 4: Verify health endpoint

```bash
curl localhost:4000/health
# Expected: {"status":"ok","info":{"db":{"status":"up"},"redis":{"status":"up"}},"error":{},"details":{"db":{"status":"up"},"redis":{"status":"up"}}}
```

### Step 5: Verify web apps

```bash
curl -s http://localhost:3000 | grep -o 'OK\|Down'
curl -s http://localhost:3001 | grep -o 'OK\|Down'
```

### Step 6: Verify seed

```bash
pnpm db:seed
# Should output: "Seeded tenant IVORY GLOW with 3 products"
```

### Step 7: Run Playwright smoke tests

```bash
pnpm test:e2e
```

### Step 8: Commit migration

```bash
git add -A
git commit -m "feat(E00): add E00_base Prisma migration"
```

---

## Self-review

**1. Spec coverage check:**
- T1 monorepo init → ✓ (Step 1 of plan)
- T2 packages/config → ✓ (Step 2)
- T3 packages/db → ✓ (Step 3)
- T4 apps/api → ✓ (Step 4)
- T5 Next.js apps → ✓ (Step 5)
- T6 Docker + fakes → ✓ (Step 6)
- T7 Test tooling → ✓ (Step 7)
- T8 CI → ✓ (Step 8)
- T9 Docs → ✓ (Step 9)
- T10 Migration + verification → ✓ (Step 10)
- Cross-epic port registry → ✓ (compose.yml ports match CROSS-EPIC-REQUESTS.md)
- CI job names → ✓ (lint, typecheck, test, build, compose-config)
- HealthModule handoff for E17 → ✓ (clean module structure)
- ci.yml one-line includes for E21 → ✓ (commented placeholder slots)

**2. Placeholder scan:** No TBD/TODO found. All code steps contain actual code.

**3. Type consistency:** Env type exported from config, consumed in api. Prisma client exported from db, consumed in api health indicator. All consistent.
