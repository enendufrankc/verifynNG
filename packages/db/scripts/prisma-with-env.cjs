#!/usr/bin/env node
/**
 * Wrapper that loads .env.example from the repo root as fallback,
 * then runs the given prisma command. This ensures `pnpm db:migrate`
 * and `pnpm db:seed` work from a fresh clone with `docker compose up`.
 */
const { config } = require('dotenv');
const { resolve } = require('node:path');
const { execSync } = require('node:child_process');

// Load .env.example as fallback if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, '../../../.env.example');
  config({ path: envPath });
}

const args = process.argv.slice(2);
const cmd = `npx prisma ${args.join(' ')}`;
try {
  execSync(cmd, { stdio: 'inherit', env: process.env });
} catch (e) {
  process.exit(e.status ?? 1);
}
