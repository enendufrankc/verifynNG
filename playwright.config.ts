import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree ports: .env (written by scripts/epic start) first, then .env.example defaults.
config({ path: resolve(__dirname, '.env') });
config({ path: resolve(__dirname, '.env.example') });

const verifyPort = process.env.WEB_VERIFY_PORT ?? '3000';
const adminPort = process.env.WEB_ADMIN_PORT ?? '3001';

// Specs that don't target a specific app: run under every project.
const SHARED_SPECS = [/\/smoke\.spec\.ts$/, /\/fixtures\/fixtures\.spec\.ts$/];

// web-verify: consumer verification app (`/`, `/verify`, `/v/:code`, `/legal/*`).
// New specs for this app: name them `verify-*.spec.ts` (or add here).
// Excludes verify-rate-limited.spec.ts — that one runs only in the dedicated
// web-verify-rate-limit project below, ordered after these two finish.
const VERIFY_SPECS = [
  ...SHARED_SPECS,
  /\/cookieless\.spec\.ts$/,
  /\/verify-(?!rate-limited\.spec\.ts$).*\.spec\.ts$/,
];

// web-admin: tenant console app (`/login`, `/reports`, `/anomalies`, `/deliveries`, ...).
// New specs for this app: add their pattern here (or drop them under tests/e2e/anomalies/).
const ADMIN_SPECS = [
  ...SHARED_SPECS,
  /\/analytics\.spec\.ts$/,
  /\/compliance\.spec\.ts$/,
  /\/oem-manifest\.spec\.ts$/,
  /\/reports\.spec\.ts$/,
  /\/anomalies\/.*\.spec\.ts$/,
];

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'web-verify-desktop',
      use: {
        baseURL: `http://localhost:${verifyPort}`,
        viewport: { width: 1280, height: 720 },
      },
      testMatch: VERIFY_SPECS,
    },
    {
      name: 'web-verify-mobile',
      use: {
        baseURL: `http://localhost:${verifyPort}`,
        viewport: { width: 375, height: 667 },
        isMobile: true,
      },
      testMatch: VERIFY_SPECS,
    },
    {
      name: 'web-admin-desktop',
      use: {
        baseURL: `http://localhost:${adminPort}`,
        viewport: { width: 1280, height: 720 },
      },
      testMatch: ADMIN_SPECS,
    },
    {
      // Deliberately exhausts the shared per-IP verify rate limit — must run
      // after every other browser-driven verify spec, never alongside them.
      // `dependencies` makes Playwright finish those two projects first.
      name: 'web-verify-rate-limit',
      use: {
        baseURL: `http://localhost:${verifyPort}`,
        viewport: { width: 1280, height: 720 },
      },
      testMatch: [/\/verify-rate-limited\.spec\.ts$/],
      dependencies: ['web-verify-desktop', 'web-verify-mobile'],
    },
  ],
});
