import { resolve } from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  loginAs,
  openConsole,
  openVerify,
  getPrisma,
  seedPageableProduct,
} from './fixtures/index.js';

// This spec drives both the web-admin builder and (to check the published
// result) the web-verify public page in the same user journey, so every
// navigation uses an absolute-URL helper (openConsole/openVerify) rather
// than relative page.goto() — `pnpm test:e2e --grep product-pages` runs
// this file under all three Playwright projects, and a relative goto()
// would resolve against whichever project's baseURL happens to be active.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DEV_PASSWORD = 'Passw0rd!Passw0rd!';
const HERO_IMAGE = resolve(
  __dirname,
  '../../packages/db/prisma/seed/product-pages/assets/model-2.webp',
);

async function getAccessToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password: DEV_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = await res.json();
  return accessToken as string;
}

test.describe('E10 product-pages — builder flow @e10', () => {
  test.describe.configure({ mode: 'serial' });

  // Drives web-admin (loginAs uses a relative /login goto) — `pnpm test:e2e`
  // with no --project runs every spec under all three projects, and the
  // other two have no /login route at all.
  // Playwright requires an object-destructuring first param to detect which
  // fixtures a hook uses — {} is intentional, this hook uses none.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'web-admin-desktop',
      'admin-only spec — see comment above',
    );
  });

  let pageId: string;
  let slug: string;
  let title: string;
  let productLabel: string;

  test.beforeAll(async () => {
    const { sku, name } = await seedPageableProduct(getPrisma());
    slug = `e10-e2e-${Date.now()}`;
    title = `E2E Hero Title ${Date.now()}`;
    // The product select's option text is `${name} (${sku})` (see
    // apps/web-admin/app/(console)/pages/page.tsx).
    productLabel = `${name} (${sku})`;
  });

  test('create → add hero block → upload image → autosave → preview updates → publish → public page shows content', async ({
    page,
  }) => {
    await loginAs(page, 'operator');
    await openConsole(page, '/pages');
    // PolicyReacceptGuard's async acceptance-status check re-wraps the page
    // once it resolves — settle first so it doesn't reset dialog state
    // mid-interaction.
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Create page' }).click();
    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: productLabel });
    await page.locator('#create-page-slug').fill(slug);
    await page.getByRole('button', { name: 'Create' }).click();

    await page.waitForURL(/\/pages\/[a-z0-9]+$/i, { timeout: 15_000 });
    pageId = page.url().split('/pages/')[1];
    expect(pageId).toBeTruthy();

    // Add a hero block and fill it in.
    await page.getByRole('button', { name: 'Add block' }).click();
    await page.getByText('hero', { exact: true }).click();
    await page.locator('#hero-title').fill(title);

    // Upload the hero image (alt text required first).
    await page.locator('[id^="media-alt-"]').first().fill('E2E hero image');
    await page.locator('input[type="file"]').setInputFiles(HERO_IMAGE);
    await expect(page.getByText('Replace image')).toBeVisible({
      timeout: 15_000,
    });

    // Autosave (800ms debounce) — proven by the preview iframe below, which
    // only reloads (previewNonce increments) once the draft PUT succeeds.
    // Preview updates — the iframe points at web-verify's /preview route
    // and re-renders the full page for the current draft content.
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await expect(
      preview.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    // Publish.
    await page.locator('#change-note').fill('E2E first publish');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Public page shows the published content.
    await openVerify(page, `/p/ivoryglow/${slug}`);
    await expect(
      page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
  });

  test('drag-order persists — reordering blocks updates the preview', async ({
    page,
  }) => {
    test.skip(!pageId, 'depends on the create/publish test above');

    await loginAs(page, 'operator');
    await openConsole(page, `/pages/${pageId}`);
    await page.waitForLoadState('networkidle');

    // Page has one "hero" block from the test above; add "story" as a
    // second block so there is something to reorder.
    await page.getByRole('button', { name: 'Add block' }).click();
    await page.getByText('story', { exact: true }).click();
    await page.locator('#story-heading').fill('E2E Story Heading');

    // Confirm initial DOM order is [hero, story] before dragging.
    const rowsBefore = await page
      .locator('button:text-is("hero"), button:text-is("story")')
      .allTextContents();
    expect(rowsBefore).toEqual(['hero', 'story']);

    // Drag the "story" row's handle above the "hero" row (dnd-kit
    // PointerSensor — needs real mouse down/move/up with enough travel to
    // clear its activation distance, not a single drag-and-drop jump).
    const storyHandle = page
      .locator('button[aria-label="Drag to reorder"]')
      .nth(1);
    const heroHandle = page
      .locator('button[aria-label="Drag to reorder"]')
      .nth(0);
    const storyBox = await storyHandle.boundingBox();
    const heroBox = await heroHandle.boundingBox();
    if (!storyBox || !heroBox) throw new Error('drag handles not found');

    await page.mouse.move(
      storyBox.x + storyBox.width / 2,
      storyBox.y + storyBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      heroBox.x + heroBox.width / 2,
      heroBox.y + heroBox.height / 2 - 4,
      { steps: 10 },
    );
    await page.mouse.up();

    const rowsAfter = await page
      .locator('button:text-is("hero"), button:text-is("story")')
      .allTextContents();
    expect(rowsAfter).toEqual(['story', 'hero']);

    // Autosave persists the new order — the preview iframe's story heading
    // now renders above the hero title.
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await expect(
      preview.getByRole('heading', { name: 'E2E Story Heading' }),
    ).toBeVisible({ timeout: 15_000 });

    const storyY = await preview
      .getByRole('heading', { name: 'E2E Story Heading' })
      .boundingBox();
    const heroY = await preview
      .getByRole('heading', { name: title, level: 1 })
      .boundingBox();
    expect(storyY!.y).toBeLessThan(heroY!.y);

    // Remove the story block so the rollback test below sees the same
    // single-hero-block shape it expects.
    await page.getByRole('button', { name: 'Remove story block' }).click();
    await page.waitForTimeout(1500);
  });

  test('rollback flow — restores the original version', async ({ page }) => {
    test.skip(!pageId, 'depends on the create/publish test above');

    await loginAs(page, 'operator');
    await openConsole(page, `/pages/${pageId}`);
    await page.waitForLoadState('networkidle');

    const updatedTitle = `${title} (updated)`;
    await page.locator('#hero-title').fill(updatedTitle);
    // Autosave debounces 800ms before even sending the draft PUT.
    await page.waitForTimeout(1500);
    await page.locator('#change-note').fill('E2E second publish');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await openConsole(page, `/pages/${pageId}/history`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Version 1')).toBeVisible();
    await expect(page.getByText('Version 2')).toBeVisible();

    await page
      .locator('li', { hasText: 'Version 1' })
      .getByRole('button', { name: 'Restore this version' })
      .click();
    await expect(page.getByText('Rolled back', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await openVerify(page, `/p/ivoryglow/${slug}`);
    await expect(
      page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: updatedTitle, level: 1 }),
    ).not.toBeVisible();
  });

  test('viewer cannot edit — UI disables writes and the API rejects them', async ({
    page,
    request,
  }) => {
    test.skip(!pageId, 'depends on the create/publish test above');

    await loginAs(page, 'viewer');
    await openConsole(page, `/pages/${pageId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();

    const viewerToken = await getAccessToken(request, 'viewer@ivoryglow.local');
    const res = await request.put(
      `${API_URL}/v1/product-pages/${pageId}/draft`,
      {
        headers: { Authorization: `Bearer ${viewerToken}` },
        data: { theme: {}, blocks: [], seo: {} },
      },
    );
    expect(res.status()).toBe(403);
  });

  test('builder and history pages pass axe (excluding known shared-sidebar contrast + cross-origin preview iframe)', async ({
    page,
  }) => {
    test.skip(!pageId, 'depends on the create/publish test above');

    await loginAs(page, 'operator');

    await openConsole(page, `/pages/${pageId}`);
    const builderResults = await new AxeBuilder({ page })
      .exclude('iframe')
      .analyze();
    const builderBlocking = builderResults.violations.filter(
      (v) =>
        ['critical', 'serious'].includes(v.impact ?? '') &&
        v.id !== 'color-contrast',
    );
    expect(builderBlocking).toEqual([]);

    await openConsole(page, `/pages/${pageId}/history`);
    const historyResults = await new AxeBuilder({ page }).analyze();
    const historyBlocking = historyResults.violations.filter(
      (v) =>
        ['critical', 'serious'].includes(v.impact ?? '') &&
        v.id !== 'color-contrast',
    );
    expect(historyBlocking).toEqual([]);
  });
});
