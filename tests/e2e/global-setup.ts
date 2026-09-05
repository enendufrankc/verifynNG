import { config } from 'dotenv';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults —
// same lookup order as playwright.config.ts and the realistic seed itself.
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../.env.example') });

const REPO_ROOT = resolve(__dirname, '../..');
const API_PORT = process.env.API_HOST_PORT ?? '4000';
const VERIFY_PORT = process.env.WEB_VERIFY_PORT ?? '3000';
const ADMIN_PORT = process.env.WEB_ADMIN_PORT ?? '3001';

async function waitForHealth(
  url: string,
  label: string,
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `global-setup: ${label} at ${url} did not become healthy within ${timeoutMs}ms (last error: ${String(lastError)}). Is \`docker compose -f docker/compose.yml up -d\` running?`,
  );
}

/**
 * Playwright's global setup. Two jobs, matching E21's T6:
 * 1. Wait for the compose stack to be reachable — a cold `docker compose up`
 *    can still be booting when `pnpm test:e2e` starts.
 * 2. Run the realistic seed at scale 0.1 so `manifest.json` exists — most
 *    fixtures resolve seeded users/emails without it (see fixtures/auth.ts),
 *    but the fixture self-check (fixtures.spec.ts) and any future spec that
 *    passes a `tenantSlug` need it, and it must be current for whichever
 *    branch's specs are running.
 */
export default async function globalSetup(): Promise<void> {
  await Promise.all([
    waitForHealth(`http://localhost:${API_PORT}/ready`, 'api'),
    waitForHealth(`http://localhost:${VERIFY_PORT}/api/health`, 'web-verify'),
    waitForHealth(`http://localhost:${ADMIN_PORT}/api/health`, 'web-admin'),
  ]);

  execFileSync('pnpm', ['db:seed:realistic', '--', '--scale', '0.1'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}
