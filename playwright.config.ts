import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree ports: .env (written by scripts/epic start) first, then .env.example defaults.
config({ path: resolve(__dirname, '.env') });
config({ path: resolve(__dirname, '.env.example') });

const verifyPort = process.env.WEB_VERIFY_PORT ?? '3000';
const adminPort = process.env.WEB_ADMIN_PORT ?? '3001';

// scripts/epic offsets every port by 103 * epic number, so a given epic's
// worktree can land squarely on one of Chromium's hardcoded unsafe ports
// (https://chromium.googlesource.com/chromium/src/+/main/net/base/port_util.cc)
// — epic 20 (offset 2060) puts WEB_VERIFY_PORT/WEB_ADMIN_PORT at 5060/5061,
// which are SIP and SIP-TLS. Without this flag every navigation to either
// port fails with net::ERR_UNSAFE_PORT, in any Chromium (this test runner's
// bundled browser included, not just an interactively-driven one) — found
// running E20's SSO Playwright suite.
const chromiumArgs = [`--explicitly-allowed-ports=${verifyPort},${adminPort}`];

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    launchOptions: { args: chromiumArgs },
  },
  projects: [
    {
      name: 'web-verify-desktop',
      use: {
        baseURL: `http://localhost:${verifyPort}`,
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /.*\.spec\.ts/,
    },
    {
      name: 'web-verify-mobile',
      use: {
        baseURL: `http://localhost:${verifyPort}`,
        viewport: { width: 375, height: 667 },
        isMobile: true,
      },
      testMatch: /.*\.spec\.ts/,
    },
    {
      name: 'web-admin-desktop',
      use: {
        baseURL: `http://localhost:${adminPort}`,
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
