import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  getPrisma,
  seedVerifyFixtures,
  seedTier1WithoutPage,
  type VerifyFixtures,
} from './fixtures/index.js';

test.describe('E10 product-pages — tier-1 verdict slot @e10', () => {
  // Drives web-verify (relative /v/[code] and /p/... gotos) — `pnpm test:e2e`
  // with no --project runs every spec under all three projects, and
  // web-admin-desktop has no /v or /p routes at all.
  // Playwright requires an object-destructuring first param to detect which
  // fixtures a hook uses — {} is intentional, this hook uses none.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('web-verify'),
      'web-verify-only spec — see comment above',
    );
  });

  let fixtures: VerifyFixtures;
  let noPageCode: string;

  test.beforeAll(async () => {
    const prisma = getPrisma();
    fixtures = await seedVerifyFixtures(prisma);
    noPageCode = await seedTier1WithoutPage(prisma);
  });

  test('shows the compact product page for a product with a published page (fixtures.tier1Ok)', async ({
    page,
  }) => {
    await page.goto(`/v/${fixtures.tier1Ok}`);
    await expect(page.locator('h1')).toHaveText('Genuine');
    // T7's compact renderer (turmeric-curcumin has a published T12 page).
    await expect(
      page.getByRole('heading', { name: 'Turmeric & Curcumin', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See full product page' }),
    ).toBeVisible();
  });

  test('falls back to the E09 default rows for a product without a published page', async ({
    page,
  }) => {
    await page.goto(`/v/${noPageCode}`);
    await expect(page.locator('h1')).toHaveText('Genuine');
    // No compact-renderer content: retinol only ships a draft page (never
    // published), so the tier-1 slot falls through to E09's default rows.
    await expect(
      page.getByRole('link', { name: 'See full product page' }),
    ).not.toBeVisible();
  });

  test('published public page passes axe (excluding the known tenant-theme contrast tradeoff)', async ({
    page,
  }) => {
    await page.goto('/p/ivoryglow/turmeric-curcumin');
    const results = await new AxeBuilder({ page }).analyze();
    // color-contrast here comes from the tenant's own chosen brand palette
    // (packages/db/prisma/seed/product-pages/index.ts THEME, applied via
    // pageThemeStyle as CSS custom properties) — a per-tenant content
    // choice the page builder deliberately allows, not a platform template
    // default. See docs/product-pages.md's theming section.
    const blocking = results.violations.filter(
      (v) =>
        ['critical', 'serious'].includes(v.impact ?? '') &&
        v.id !== 'color-contrast',
    );
    expect(blocking).toEqual([]);
  });
});
