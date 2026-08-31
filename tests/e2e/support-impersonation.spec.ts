import { test, expect, type Page } from '@playwright/test';

/**
 * web-admin only — see cookieless.spec.ts for why this is a per-test guard
 * rather than a playwright.config.ts testMatch change.
 *
 * Covers the core of E18's AC2-AC4: read-only impersonation opens in a new
 * tab, blocks a mutation, elevating to write mode with a reason allows one,
 * and the reason bar itself is enforced. AC5-AC8 (console/public/email
 * intake, the restore drill) are not covered here — see
 * docs/epics/E18-support-tooling.md's own Testing section for what's still
 * manual-only.
 */
const PASSWORD = 'Passw0rd!Passw0rd!';
const API_BASE_URL = `http://localhost:${process.env.API_HOST_PORT ?? '4000'}`;

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

test.describe('E18 support impersonation @support', () => {
  test('support lands on the tenant directory after login', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'support@verifyng.local');
    await expect(page).toHaveURL(/\/support$/);
    await expect(
      page.getByRole('heading', { name: 'Tenants', exact: true }),
    ).toBeVisible();
    // DataTable renders both a desktop table and a mobile card list in the
    // DOM at once (CSS-hidden, not removed) — .first() sidesteps the strict-
    // mode "resolved to 2 elements" violation that a bare getByText hits.
    await expect(page.getByText('IVORY GLOW').first()).toBeVisible();
  });

  test('read-only impersonation opens in a new tab and blocks a mutation', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'support@verifyng.local');
    await expect(page).toHaveURL(/\/support$/);

    const row = page.getByRole('row', { name: /IVORY GLOW/ });
    const [impersonated] = await Promise.all([
      context.waitForEvent('page'),
      row.getByRole('button', { name: 'View as tenant' }).click(),
    ]);

    // The accessToken lives only in an in-memory zustand store (never a
    // cookie or sessionStorage — see lib/impersonation-store.ts's comment on
    // why), so the only way to get it for a direct API assertion below is to
    // capture it off a real request the page itself makes.
    let bearerToken: string | undefined;
    impersonated.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (auth && !bearerToken) bearerToken = auth;
    });
    await impersonated.waitForLoadState('domcontentloaded');

    await expect(impersonated.getByText(/read-only/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      impersonated.getByText(/Viewing IVORY GLOW as support/),
    ).toBeVisible();

    // Confirm the guard, not just the UI: a mutation on this session's
    // token is rejected server-side regardless of what the button does.
    expect(bearerToken).toBeTruthy();
    const response = await impersonated.request.post(
      `${API_BASE_URL}/tenants/ivoryglow/batches`,
      {
        headers: { authorization: bearerToken! },
        data: { productId: 'does-not-matter', count: 1 },
        failOnStatusCode: false,
      },
    );
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.message?.error ?? body.error).toBe('impersonation_read_only');

    await impersonated.getByRole('button', { name: 'End session' }).click();
    await impersonated.close();
  });

  test('elevating requires a real reason and then allows a write', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'support@verifyng.local');
    const row = page.getByRole('row', { name: /IVORY GLOW/ });
    const [impersonated] = await Promise.all([
      context.waitForEvent('page'),
      row.getByRole('button', { name: 'View as tenant' }).click(),
    ]);
    await impersonated.waitForLoadState('domcontentloaded');

    await impersonated.getByRole('button', { name: 'Elevate' }).click();
    const reasonBox = impersonated.getByLabel('Reason');
    await reasonBox.fill('too short');
    await expect(
      impersonated.getByRole('button', { name: 'Elevate', exact: true }).last(),
    ).toBeDisabled();

    await reasonBox.fill(
      'Reproducing ticket #1042: mint fails with 500 for product X',
    );
    await impersonated
      .getByRole('button', { name: 'Elevate', exact: true })
      .last()
      .click();

    await expect(impersonated.getByText(/WRITE MODE/)).toBeVisible({
      timeout: 10_000,
    });

    await impersonated.getByRole('button', { name: 'End session' }).click();
    await impersonated.close();
  });
});
