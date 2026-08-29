#!/usr/bin/env node
/**
 * Wrapper that loads .env then .env.example from the repo root,
 * then runs the given prisma command. This ensures `pnpm db:migrate`
 * and `pnpm db:seed` work from a fresh clone with `docker compose up`.
 */
const { config } = require('dotenv');
const { resolve } = require('node:path');
const { execSync } = require('node:child_process');

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults.
// dotenv never overrides variables that are already set.
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../../.env.example') });

const args = process.argv.slice(2);
const cmd = `npx prisma ${args.join(' ')}`;
try {
  execSync(cmd, { stdio: 'inherit', env: process.env });
} catch (e) {
  process.exit(e.status ?? 1);
}
