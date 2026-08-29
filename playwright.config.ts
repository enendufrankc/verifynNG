import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree ports: .env (written by scripts/epic start) first, then .env.example defaults.
config({ path: resolve(__dirname, '.env') });
config({ path: resolve(__dirname, '.env.example') });

const verifyPort = process.env.WEB_VERIFY_PORT ?? '3000';
const adminPort = process.env.WEB_ADMIN_PORT ?? '3001';

export default defineConfig({
  testDir: './tests/e2e',
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
