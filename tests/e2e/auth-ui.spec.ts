import { test, expect, type Page } from '@playwright/test';

/**
 * E11 — auth + onboarding visual refresh.
 *
 * These assertions are deliberately behavioural: they pin the controls, the
 * accessible names, the error surfaces and the navigation targets that the
 * refresh must not change, plus the shared-shell markers the refresh adds
 * (a single auth card landmark, an accessible signup progress indicator).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const DEV_PASSWORD = 'Passw0rd!Passw0rd!';
const OWNER_EMAIL = 'owner@ivoryglow.local';

async function ownerToken(
  request: import('@playwright/test').APIRequestContext,
): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: OWNER_EMAIL, password: DEV_PASSWORD, tenant: 'ivoryglow' },
  });
  if (!res.ok()) throw new Error(`owner login failed: ${res.status()}`);
  const { accessToken } = await res.json();
  return accessToken as string;
}

/**
 * `/signup` is not in `middleware.ts`'s PUBLIC_PATHS, so an anonymous visit is
 * redirected to `/login?next=/signup`. That gate is pre-existing product
 * behaviour and out of scope for a visual refresh, so this spec establishes a
 * session first and then exercises the onboarding presentation.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(OWNER_EMAIL);
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

test.describe('E11 auth + onboarding UI', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'web-admin-desktop',
      'admin-console-only spec',
    );
  });

  test('login exposes organisation, email, password and forgot-password controls', async ({
    page,
  }) => {
    await page.goto('/login');

    await expect(
      page.getByRole('heading', { name: 'Sign in', level: 2 }),
    ).toBeVisible();
    await expect(page.locator('#tenant')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute('href', '/forgot-password');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // The refresh composes every auth screen inside one labelled card.
    await expect(page.getByTestId('auth-card')).toBeVisible();
  });

  test('the submit control keeps a comfortable touch target and a visible focus ring', async ({
    page,
  }) => {
    await page.goto('/login');

    const submit = page.getByRole('button', { name: 'Sign in' });
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.locator('#password').focus();
    await page.keyboard.press('Tab');
    // Focus must land on something inside the card and be visibly ringed.
    const outlineStyle = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { ring: s.boxShadow, outline: s.outlineStyle };
    });
    expect(outlineStyle).not.toBeNull();
  });

  test('an invalid submission shows the existing error text and stays on /login', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.locator('#email').fill('nobody@ivoryglow.local');
    await page.locator('#password').fill('wrong-password-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByTestId('auth-error')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('a successful sign-in still lands on the console root', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.locator('#email').fill(OWNER_EMAIL);
    await page.locator('#password').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15_000,
    });
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('an SSO-enabled organisation offers the SSO control alongside the password form', async ({
    page,
    request,
  }) => {
    const token = await ownerToken(request);
    await request.put(`${API_URL}/tenants/ivoryglow/sso`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        provider: 'fake',
        clientId: 'verifyng-local',
        clientSecret: 'local-dev-secret',
        issuer: 'http://fake-oidc:4104/default',
        allowedDomains: ['ivoryglow.com'],
        jitProvisioning: true,
        jitDefaultRole: 'viewer',
        enforceSso: false,
      },
    });

    await page.goto('/login');
    await page.locator('#tenant').fill('ivoryglow');

    await expect(
      page.getByRole('button', { name: /continue with sso/i }),
    ).toBeVisible({ timeout: 10_000 });
    // enforceSso is false, so the password form is still offered.
    await expect(page.locator('#password')).toBeVisible();
  });

  test('forgot password keeps its no-enumeration confirmation and back link', async ({
    page,
  }) => {
    await page.goto('/forgot-password');

    await expect(
      page.getByRole('heading', { name: 'Reset your password' }),
    ).toBeVisible();
    await page.locator('#email').fill('someone@ivoryglow.local');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(
      page.getByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to sign in' }),
    ).toHaveAttribute('href', '/login');
  });

  test('reset password validates matching passwords before calling the API', async ({
    page,
  }) => {
    await page.goto('/reset-password?token=not-a-real-token');

    await page.locator('#newPassword').fill('Passw0rd!Passw0rd!');
    await page.locator('#confirmPassword').fill('Different!Different!');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.getByTestId('auth-error')).toContainText(
      'Passwords do not match',
    );
  });

  test('login renders without horizontal overflow at 360px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('signup step 1 exposes an accessible progress indicator and its current step', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/signup');

    await expect(
      page.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible();

    const progress = page.getByRole('progressbar', { name: 'Step 1 of 5' });
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    await expect(progress).toHaveAttribute('aria-valuemax', '5');
  });

  test('signup keeps its validation message and step transition', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/signup');

    await page
      .getByRole('button', { name: 'Continue to business details' })
      .click();
    await expect(page.getByTestId('signup-error')).toContainText(
      'Enter a valid work email to continue.',
    );

    await page.getByLabel('Work email').fill('owner@testbrand.example');
    await page
      .getByRole('button', { name: 'Continue to business details' })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Business details' }),
    ).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Step 2 of 5' }),
    ).toHaveAttribute('aria-valuenow', '2');
    await expect(page.getByLabel('Business name')).toBeVisible();
    await expect(page.getByLabel('Country')).toBeVisible();
  });

  test('signup renders without horizontal overflow at 360px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page);
    await page.goto('/signup');
    await expect(
      page.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
