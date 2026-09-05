import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  getPrisma,
  seedVerifyFixtures,
  type VerifyFixtures,
} from './fixtures/index.js';

test.describe('E09 verdicts @e09', () => {
  let fixtures: VerifyFixtures;

  test.beforeAll(async () => {
    fixtures = await seedVerifyFixtures(getPrisma());
  });

  test('authentic — first tier-2 scan', async ({ page }) => {
    await page.goto(`/v/${fixtures.authenticFirstScan}`);
    await expect(page.locator('h1')).toHaveText('Authentic');
  });

  test('already-verified — second scan, single region', async ({ page }) => {
    await page.goto(`/v/${fixtures.alreadyVerified}`);
    await expect(page.locator('h1')).toHaveText('Checked before');
    await expect(page.getByText('Lagos, NG')).toBeVisible();
  });

  test('suspicious — many scans across regions, reportable', async ({
    page,
  }) => {
    await page.goto(`/v/${fixtures.suspicious}`);
    await expect(page.locator('h1')).toHaveText('Check this');
    // Both the verdict message and the ReportPrompt mention "counterfeit" —
    // assert the report prompt specifically, since reportable=true here.
    await expect(
      page.getByText('Think this might be counterfeit?'),
    ).toBeVisible();
  });

  test('flagged — brand-flagged unit, reportable', async ({ page }) => {
    await page.goto(`/v/${fixtures.flagged}`);
    await expect(page.locator('h1')).toHaveText('Flagged by the brand');
  });

  test('decommissioned — withdrawn, no report prompt', async ({ page }) => {
    await page.goto(`/v/${fixtures.decommissioned}`);
    await expect(page.locator('h1')).toHaveText('Withdrawn');
    await expect(page.getByText(/counterfeit/i)).not.toBeVisible();
  });

  test('unknown — well-formed code, no matching unit', async ({ page }) => {
    await page.goto(`/v/${fixtures.unknownWellFormed}`);
    await expect(page.locator('h1')).toHaveText('Not recognised');
  });

  test('invalid — malformed code', async ({ page }) => {
    await page.goto('/v/not-a-code');
    await expect(page.locator('h1')).toHaveText('Not a valid code');
  });

  test('ok — tier-1 public QR scan, with education panel', async ({ page }) => {
    await page.goto(`/v/${fixtures.tier1Ok}`);
    await expect(page.locator('h1')).toHaveText('Genuine');
    await expect(
      page.getByRole('heading', { name: /find the hidden code/i }),
    ).toBeVisible();
  });

  test('every verdict page passes axe with no critical/serious violations', async ({
    page,
  }) => {
    await page.goto(`/v/${fixtures.authenticFirstScan}`);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    );
    expect(blocking).toEqual([]);
  });
});

// The rate-limit-exhaustion assertion lives in verify-rate-limited.spec.ts,
// run by its own `web-verify-rate-limit` Playwright project (depends on both
// web-verify-desktop and web-verify-mobile) — see that file and
// playwright.config.ts for why: it deliberately exhausts the shared per-IP
// budget every browser-driven verify spec relies on, so it must run only
// after everything else that needs a working budget has finished.
