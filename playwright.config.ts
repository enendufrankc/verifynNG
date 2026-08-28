import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  projects: [
    {
      name: 'web-verify',
      use: { baseURL: 'http://localhost:3000' },
      testMatch: /web-verify\.spec/,
    },
    {
      name: 'web-admin',
      use: { baseURL: 'http://localhost:3001' },
      testMatch: /web-admin\.spec/,
    },
  ],
});
