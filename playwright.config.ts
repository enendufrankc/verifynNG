import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  projects: [
    {
      name: 'web-verify',
      use: { baseURL: 'http://localhost:3000' },
    },
    {
      name: 'web-admin',
      use: { baseURL: 'http://localhost:3001' },
    },
  ],
});
