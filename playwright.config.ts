import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree ports: .env (written by scripts/epic start) first, then .env.example defaults.
config({ path: resolve(__dirname, '.env') });
config({ path: resolve(__dirname, '.env.example') });

const verifyPort = process.env.WEB_VERIFY_PORT ?? '3000';
const adminPort = process.env.WEB_ADMIN_PORT ?? '3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  projects: [
    {
      name: 'web-verify',
      use: { baseURL: `http://localhost:${verifyPort}` },
      testMatch: /web-verify\.spec/,
    },
    {
      name: 'web-admin',
      use: { baseURL: `http://localhost:${adminPort}` },
      testMatch: /web-admin\.spec/,
    },
  ],
});
