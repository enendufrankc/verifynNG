#!/usr/bin/env node
/**
 * Generates the E16 public-API OpenAPI document from the compiled Nest app
 * (no HTTP listener started) and writes it to packages/sdk/openapi.json —
 * the committed contract packages/sdk generates types from and E21 tests
 * against. Scoped to PublicApiModule only (never E06's separate
 * apps/api/openapi/verify.v1.json or any other `/v1/**` console route).
 *
 * Requires `pnpm --filter @verifynng/api build` to have run first — this
 * imports the compiled `dist/...js`, not the TS source.
 *
 * `public-api:openapi:check` (below) re-runs this and diffs the result
 * against the committed file, so any change to an `@ApiProperty()`-decorated
 * DTO or route without regenerating the committed schema fails CI.
 */
import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Per-worktree overrides first (.env, written by scripts/epic start), then
// repo defaults — same precedence as packages/db/vitest.setup.ts. Without
// this, REDIS_URL/DATABASE_URL fall back to the docker-internal service
// names ("redis"/"postgres"), which don't resolve on the host and make
// ioredis retry forever instead of erroring.
loadDotenv({ path: join(__dirname, '../../../.env') });
loadDotenv({ path: join(__dirname, '../../../.env.example') });

async function main() {
  const { AppModule } = await import(join(__dirname, '../dist/app.module.js'));
  const { buildPublicApiDocument } = await import(
    join(__dirname, '../dist/modules/public-api/openapi.js')
  );

  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildPublicApiDocument(app);

  const outPath = join(__dirname, '../../../packages/sdk/openapi.json');
  await writeFile(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  // The committed file goes through the pre-commit hook's `prettier --write`
  // (lint-staged matches every *.json), which reformats arrays/objects
  // differently from a raw JSON.stringify(doc, null, 2) in places (e.g.
  // collapsing short arrays onto one line) — format here too so
  // `git diff --exit-code` in :check never sees purely cosmetic drift.
  execFileSync('npx', ['prettier', '--write', outPath], { stdio: 'inherit' });

  await app.close();
  console.log(`Wrote ${outPath}`);
  // app.close() doesn't disconnect the raw PrismaClient/ioredis providers
  // (they have no OnModuleDestroy hook), so the event loop never drains on
  // its own — force exit now that the file is written.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
