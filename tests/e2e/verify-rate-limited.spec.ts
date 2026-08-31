import { test, expect } from '@playwright/test';
import { getPrisma, seedVerifyFixtures } from './fixtures/index.js';

// Split out of verify-verdicts.spec.ts: this test deliberately exhausts the
// shared per-IP verify rate limit (docker/compose.yml's RATE_LIMIT_IP_PER_MIN)
// to prove the limiter degrades cleanly, which poisons every other
// browser-driven verify spec sharing that same IP for the rest of the
// window — regardless of file-local ordering, since Playwright runs
// different spec files concurrently in separate workers. Its own
// `web-verify-rate-limit` project (playwright.config.ts) declares
// `dependencies` on both web-verify-desktop and web-verify-mobile, so
// Playwright only starts this file after every other verify spec has
// finished, and nothing else depends on this project.
test.describe('E09 rate limit @e09', () => {
  let tier1Ok: string;

  test.beforeAll(async () => {
    const fixtures = await seedVerifyFixtures(getPrisma());
    tier1Ok = fixtures.tier1Ok;
  });

  test('rate-limited — too many attempts, no crash', async ({
    page,
    request,
  }) => {
    // Comfortably above docker/compose.yml's RATE_LIMIT_IP_PER_MIN default (120).
    for (let i = 0; i < 150; i++) {
      await request.get(`/v/${tier1Ok}`);
    }
    await page.goto(`/v/${tier1Ok}`);
    await expect(page.locator('h1')).toHaveText('Too many checks');
  });
});
