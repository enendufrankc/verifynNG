import { test, expect, type Page } from '@playwright/test';

/**
 * web-admin only — each test skips itself on the web-verify projects (see
 * cookieless.spec.ts for why this is a per-test guard rather than a
 * playwright.config.ts testMatch change: all 3 projects currently share
 * one broad pattern).
 *
 * Uses real login (E02's actual auth, not the stale TODO(E02) stub in
 * fixtures/auth.ts) against seeded users — see packages/db/prisma/seed.ts.
 */
const PASSWORD = 'Passw0rd!Passw0rd!';

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

test.describe('E19 compliance flows @compliance', () => {
  test('support can publish a legal document from /legal-docs', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'support@verifyng.local');
    await page.goto('/legal-docs');
    await expect(
      page.getByRole('heading', { name: 'Legal documents' }),
    ).toBeVisible();

    const version = `2026-e2e-${Date.now()}`;
    await page.locator('select').selectOption('cookie');
    await page.getByPlaceholder('e.g. 2026-09-15').fill(version);
    await page
      .locator('textarea')
      .fill('# Cookie Policy\n\nUpdated by a Playwright test.');
    await page.getByRole('button', { name: 'Publish' }).click();

    await expect(
      page.getByText(`Published Cookie Policy v${version}.`),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test('owner is blocked by the re-acceptance interstitial until accepting; viewer only sees a banner', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    // Publish a new terms version requiring re-acceptance, as support.
    const supportLogin = await request.post(`${apiUrl}/auth/login`, {
      data: { email: 'support@verifyng.local', password: PASSWORD },
    });
    const { accessToken: supportToken } = await supportLogin.json();
    const version = `2026-e2e-${Date.now()}`;
    await request.post(`${apiUrl}/v1/legal/terms/versions`, {
      headers: { Authorization: `Bearer ${supportToken}` },
      data: {
        version,
        bodyMd: 'Updated by a Playwright test.',
        requiresReacceptance: true,
      },
    });

    // Viewer: sees the banner, the actual page content underneath still renders.
    await login(page, 'viewer@ivoryglow.local');
    await page.goto('/');
    await expect(
      page.getByText(
        'Your account owner must accept updated terms before continuing.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // Owner: blocked by the full interstitial — the page content is not
    // rendered underneath it at all (PolicyReacceptGuard replaces
    // {children} entirely for `owner`, unlike the operator/viewer banner
    // case above which wraps {children}).
    await login(page, 'owner@ivoryglow.local');
    await page.goto('/');
    await expect(page.getByText('Updated legal documents')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).not.toBeVisible();

    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('Updated legal documents')).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test('support can dry-run then wet-run a retention policy and see counts', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'support@verifyng.local');
    await page.goto('/compliance/retention');
    await expect(
      page.getByRole('heading', { name: 'Retention' }),
    ).toBeVisible();

    await page.locator('select').selectOption('probeResult.delete');
    await page.getByRole('button', { name: 'Dry run' }).click();
    await expect(
      page.getByText('Dry run of probeResult.delete complete.'),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Wet run' }).click();
    await expect(
      page.getByText('Wet run of probeResult.delete complete.'),
    ).toBeVisible({ timeout: 10_000 });

    const firstDataRow = page.locator('tbody tr').first();
    await expect(firstDataRow).toContainText('probeResult.delete');
  });

  test('tenant owner sees the read-only retention schedule, not the ops controls', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'owner@ivoryglow.local');
    await page.goto('/compliance/retention');
    await expect(
      page.getByRole('heading', { name: 'Retention schedule' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dry run' })).toHaveCount(0);
  });
});
