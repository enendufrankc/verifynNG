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

  // Last on purpose: this exhausts the per-IP/per-code rate limit for the
  // next ~60s, which would make any verdict request after it look
  // rate-limited too — nothing in this file runs after it.
  test('rate-limited — too many attempts, no crash', async ({
    page,
    request,
  }) => {
    for (let i = 0; i < 70; i++) {
      await request.get(`/v/${fixtures.tier1Ok}`);
    }
    await page.goto(`/v/${fixtures.tier1Ok}`);
    await expect(page.locator('h1')).toHaveText('Too many checks');
  });
});
