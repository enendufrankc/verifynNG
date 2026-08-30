#!/usr/bin/env node
/**
 * Generates the OpenAPI document for @verifynng/api from the compiled Nest
 * app (no HTTP listener is started) and writes it to
 * apps/api/openapi/verify.v1.json.
 *
 * Requires `pnpm --filter @verifynng/api build` to have run first — this
 * imports the compiled `dist/app.module.js`, not the TS source.
 *
 * `openapi:check` (below) re-runs this and diffs the result against the
 * committed file, so any change to a `@ApiProperty()`-decorated DTO or
 * route without regenerating the committed schema fails CI.
 */
import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('verifynNG — Verification & Scan Events')
    .setDescription(
      'GET /v1/verify/:code and POST /v1/verify/sms — the consumer verification hot path (E06).',
    )
    .setVersion('1.0')
    .addTag('verify')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(__dirname, '../openapi/verify.v1.json');
  await writeFile(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');

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
