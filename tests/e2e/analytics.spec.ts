import { test, expect, type Page } from '@playwright/test';

// tests/e2e/fixtures/auth.ts's loginAs() is still E02's stub (navigates only,
// never authenticates) — see its TODO. This spec logs in directly against
// the seeded `pnpm db:seed` credentials (packages/db/prisma/seed.ts) instead
// of depending on that fixture landing.
const DEV_PASSWORD = 'Passw0rd!Passw0rd!';

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email*' }).fill(email);
  await page.getByRole('textbox', { name: 'Password*' }).fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/');
}

test.describe('E12 analytics @analytics', () => {
  // Playwright requires the fixtures arg to be destructured, even when
  // unused, to detect which fixtures a hook depends on.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'web-admin-desktop',
      'admin-console-only spec',
    );
  });

  test('viewer sees the dashboard with real data and no export route', async ({
    page,
  }) => {
    await login(page, 'viewer@ivoryglow.local');
    await page.goto('/analytics');

    await expect(
      page.getByRole('main').getByText('Scans', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Verdicts over time')).toBeVisible();

    const overviewResponse = await page.waitForResponse((res) =>
      res.url().includes('/v1/analytics/overview'),
    );
    expect(overviewResponse.status()).toBe(200);

    // No nav link, and the export page itself refuses the role.
    await page.goto('/analytics/export');
    await expect(
      page.getByRole('button', { name: /Download CSV/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Exporting requires the operator or owner role.'),
    ).toBeVisible();
  });

  test('operator can export a CSV from the export page', async ({ page }) => {
    await login(page, 'operator@ivoryglow.local');
    await page.goto('/analytics/export');

    const downloadButton = page.getByRole('button', { name: /Download CSV/i });
    await expect(downloadButton).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^analytics-batch-30d\.csv$/);
  });

  test('viewer gets 403 calling the export API directly', async ({
    request,
  }) => {
    // The auth store holds the access token in memory only (no
    // localStorage persistence) — log in through the API directly instead
    // of pulling the token out of a running page.
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const loginRes = await request.post(`${apiBase}/auth/login`, {
      data: { email: 'viewer@ivoryglow.local', password: DEV_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = await loginRes.json();

    const res = await request.get(
      `${apiBase}/v1/analytics/export.csv?dimension=batch&range=30d`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(res.status()).toBe(403);
  });

  // Cross-tenant isolation (AC9's third case) needs a second seeded tenant +
  // user, which the plain `pnpm db:seed` this spec otherwise relies on
  // doesn't create (only `ivoryglow`). E12's analytics routes are JWT-scoped
  // only — they take no tenant id in the URL at all — so there is no
  // :tenantId to swap in the first place; cross-tenant access is
  // architecturally unreachable rather than merely guarded. Skipped rather
  // than faked with a same-tenant substitute.
  test.skip("cross-tenant isolation: a second tenant's viewer cannot see this tenant's data", () => {});
});
