import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  getPrisma,
  seedVerifyFixtures,
  type VerifyFixtures,
} from './fixtures/index.js';

test.describe('E09 manual entry @e09', () => {
  let fixtures: VerifyFixtures;

  test.beforeAll(async () => {
    fixtures = await seedVerifyFixtures(getPrisma());
  });

  test('normalizes lowercase/spaces/dashes/I-L-O and navigates to the right verdict (JS enabled)', async ({
    page,
  }) => {
    await page.goto('/verify');
    // Lowercase + a stray space — dots are kept (normalizeCode only
    // Crockford-substitutes I/L/O within segments *after* the first dot;
    // turning every dot into a dash, as in the epic's illustrative AC4
    // example, would make it treat the whole string — tenant slug
    // included — as one base32 blob and mis-normalize it. Dash/I-L-O
    // substitution is covered for real by
    // lib/normalize-preview.test.ts's parity test against normalizeCode.
    const raw = fixtures.tier1Ok.toLowerCase().replace(/(.{6})/, '$1 ');
    await page.getByLabel(/enter the code/i).fill(raw);
    await expect(page.getByText(/we read this as/i)).toBeVisible();
    await page.getByRole('button', { name: /verify/i }).click();
    await page.waitForURL(/\/v\//);
    await expect(page.locator('h1')).toHaveText('Genuine');
  });

  test('still submits and renders a verdict with JavaScript disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/verify');
    await page.fill('#code', fixtures.tier1Ok);
    await Promise.all([
      page.waitForURL(/\/v\//),
      page.locator('button[type=submit]').click(),
    ]);
    await expect(page.locator('h1')).toHaveText('Genuine');
    await context.close();
  });

  test('the /verify form has no critical/serious axe violations', async ({
    page,
  }) => {
    await page.goto('/verify');
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    );
    expect(blocking).toEqual([]);
  });

  test('keyboard-only walk: tab to the input, type, tab to submit, enter', async ({
    page,
  }) => {
    await page.goto('/verify');
    await page.keyboard.press('Tab');
    await page.keyboard.type(fixtures.tier1Ok);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /verify/i })).toBeFocused();
    await Promise.all([page.waitForURL(/\/v\//), page.keyboard.press('Enter')]);
    await expect(page.locator('h1')).toHaveText('Genuine');
  });
});
