import { test, expect, type Page } from '@playwright/test';

/**
 * E11 — product-owner workflow refresh (Products, Batches, New batch, Batch
 * detail).
 *
 * Covers the loading, empty, error, create, edit and archive states plus the
 * batch creation form and batch detail composition, and pins the tenant-scoped
 * routes and the existing success/error copy that the refresh must not change.
 */

const DEV_PASSWORD = 'Passw0rd!Passw0rd!';
const OWNER_EMAIL = 'owner@ivoryglow.local';
const VIEWER_EMAIL = 'viewer@ivoryglow.local';

async function signIn(page: Page, email = OWNER_EMAIL): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

function uniqueSku(): string {
  return `e11-${Date.now().toString(36)}`;
}

test.describe('E11 product owner UI', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'web-admin-desktop',
      'admin-console-only spec',
    );
  });

  test('Products leads with one header, one primary action and a tenant-scoped list', async ({
    page,
  }) => {
    await signIn(page);

    const listCall = page.waitForRequest(
      (req) =>
        req.url().includes('/tenants/ivoryglow/products') &&
        req.method() === 'GET',
    );
    await page.goto('/products');
    await listCall;

    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { name: 'Products', level: 1 }),
    ).toBeVisible();
    await expect(
      main.getByText('Catalog products this tenant mints batches for.'),
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'New product' }),
    ).toBeVisible();

    // Identifiers get the mono treatment; status uses a semantic badge.
    await expect(page.getByTestId('product-sku').first()).toHaveClass(
      /font-mono/,
    );
    await expect(main.getByText('Active').first()).toBeVisible();
  });

  test('Products shows the shared loading state while the list resolves', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/tenants/ivoryglow/products', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto('/products');

    await expect(page.locator('.animate-pulse').first()).toBeVisible();
  });

  test('Products shows one centred empty state with a recovery action', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/tenants/ivoryglow/products', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      }),
    );
    await page.goto('/products');

    await expect(
      page.getByRole('heading', { name: 'No products yet' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('products-empty').getByRole('button', {
        name: 'New product',
      }),
    ).toBeVisible();
  });

  test('Products keeps its error state when the catalog service fails', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/tenants/ivoryglow/products', (route) =>
      route.fulfill({ status: 500, body: '{}' }),
    );
    await page.goto('/products');

    await expect(
      page.getByRole('heading', { name: "Couldn't load products" }),
    ).toBeVisible();
    await expect(
      page.getByText("The catalog service isn't reachable yet."),
    ).toBeVisible();
  });

  test('an owner creates, edits and archives a product with unchanged messages', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/products');

    const sku = uniqueSku();
    await page.getByRole('button', { name: 'New product' }).click();
    await expect(
      page.getByRole('heading', { name: 'New product' }),
    ).toBeVisible();
    await page.locator('#product-sku').fill(sku);
    await page.locator('#product-name').fill('E11 refresh fixture');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByText('Product created', { exact: true }),
    ).toBeVisible();

    // DataTable renders a desktop table and mobile cards; at this project's
    // 1280px viewport only the table rows are visible.
    const row = page.getByRole('row').filter({ hasText: sku }).first();
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(
      page.getByRole('heading', { name: 'Edit product' }),
    ).toBeVisible();
    await page.locator('#product-name').fill('E11 refresh fixture v2');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByText('Product updated', { exact: true }),
    ).toBeVisible();

    await row.getByRole('button', { name: 'Archive' }).click();
    await expect(
      page.getByText(
        'Archived products can no longer be minted into new batches.',
      ),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Archive', exact: true })
      .click();
    // The API's product list filters `archivedAt: null`
    // (apps/api/src/modules/catalog/products.service.ts), so an archived
    // product leaves the table rather than showing the Archived badge — the
    // badge branch is only reachable if that endpoint ever returns archived
    // rows. Pre-existing behaviour; unchanged by this refresh.
    await expect(row).toHaveCount(0);
  });

  test('an invalid GTIN surfaces the existing validation message next to the field', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/products');

    await page.getByRole('button', { name: 'New product' }).click();
    await page.locator('#product-gtin').fill('1234567890123');
    await expect(page.getByText('Invalid GTIN check digit')).toBeVisible();
  });

  test('a viewer sees the catalog without write actions', async ({ page }) => {
    await signIn(page, VIEWER_EMAIL);
    await page.goto('/products');

    await expect(
      page.getByRole('heading', { name: 'Products', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New product' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('Batches leads with its primary action and links through to a batch', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/batches');

    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { name: 'Batches', level: 1 }),
    ).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'Mint batch' }),
    ).toHaveAttribute('href', '/batches/new');

    await page.getByTestId('batch-link').first().click();
    await page.waitForURL('**/batches/**');
    await expect(
      page.getByRole('heading', { level: 1, name: /^Batch / }),
    ).toBeVisible();
  });

  test('Batch detail groups progress, downloads and units without exposing tier-2 codes', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/batches');
    await page.getByTestId('batch-link').first().click();
    await page.waitForURL('**/batches/**');

    await expect(page.getByRole('progressbar').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Downloads', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Units', level: 2 }),
    ).toBeVisible();
    // Only the tier-1 column is ever rendered.
    await expect(page.getByText('Tier-1 code').first()).toBeVisible();
    await expect(page.getByText(/tier-2 code/i)).toHaveCount(0);
  });

  test('New batch groups the form and keeps validation and the background notice', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/batches/new');

    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { name: 'Mint batch', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('mint-form-footer')).toBeVisible();

    // Submitting with nothing selected keeps the existing field errors.
    await page.getByRole('button', { name: 'Mint batch', exact: true }).click();
    // The placeholder text and the field error read the same; the error is the
    // one carrying role="alert" next to its field.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Select a product' }),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Select an OEM' }),
    ).toBeVisible();

    await page.locator('#mint-count').fill('6000');
    await expect(page.getByText(/run in the background/)).toBeVisible();
  });

  test('an owner mints a batch and lands on its detail page', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/batches/new');

    await page.locator('#mint-product').click();
    await page.getByRole('option').first().click();
    await page.locator('#mint-oem').click();
    await page.getByRole('option').first().click();
    await page.locator('#mint-count').fill('2');
    await page.getByRole('button', { name: 'Mint batch', exact: true }).click();

    await page.waitForURL(/\/batches\/[^/]+$/, { timeout: 20_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: /^Batch / }),
    ).toBeVisible();
  });

  test('the owner journey has no horizontal overflow at 360px', async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Products', level: 1 }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto('/batches/new');
    await expect(
      page.getByRole('heading', { name: 'Mint batch', level: 1 }),
    ).toBeVisible();
    // The primary action stays reachable in a separated footer on mobile.
    await expect(page.getByTestId('mint-form-footer')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('the owner journey has no horizontal overflow at 768px', async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 768, height: 900 });

    await page.goto('/batches');
    await expect(
      page.getByRole('heading', { name: 'Batches', level: 1 }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
