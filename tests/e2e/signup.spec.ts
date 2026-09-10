import { test, expect, type Page } from '@playwright/test';

/**
 * E03/E02 — the landing page's call to action ends here, so a product owner
 * who has never touched the platform must be able to get from an empty form
 * to an application in review without anyone provisioning an account first.
 *
 * Each run registers its own account: registration is by design not
 * idempotent, and the wizard's later steps mutate the tenant it creates.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const PASSWORD = 'Signup!Passw0rd!2026';

function uniqueAccount() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    email: `owner.${stamp}@signup-e2e.test`,
    business: `Signup E2E ${stamp}`,
  };
}

const A_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

async function attach(page: Page, kind: string): Promise<void> {
  await page.locator(`#signup-doc-${kind}`).setInputFiles({
    name: `${kind}.pdf`,
    mimeType: 'application/pdf',
    buffer: A_PDF,
  });
}

async function createAccount(
  page: Page,
  account: { email: string; business: string },
): Promise<void> {
  await page.goto('/signup');
  await page.locator('#signup-contact').fill('Ada Obi');
  await page.locator('#signup-email').fill(account.email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page
    .getByRole('button', { name: 'Create account and continue' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Business details' }),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('self-serve brand signup', () => {
  test('an anonymous visitor reaches the form without a session', async ({
    page,
  }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible();
  });

  test('registers an account and carries a real session through to review', async ({
    page,
  }) => {
    const account = uniqueAccount();
    await createAccount(page, account);

    // The account exists on the API, not just in this page's state.
    const login = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: account.email, password: PASSWORD },
    });
    expect(login.ok()).toBe(true);

    await page.locator('#signup-name').fill(account.business);
    await page.getByRole('button', { name: 'Continue to documents' }).click();
    await expect(
      page.getByRole('heading', { name: 'Prove your business' }),
    ).toBeVisible({ timeout: 15_000 });

    await attach(page, 'cac_certificate');
    await attach(page, 'director_id');
    await page.getByRole('button', { name: 'Upload and continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'The trust agreement' }),
    ).toBeVisible({ timeout: 30_000 });

    await page.locator('#accept-aup').click();
    await page.locator('#accept-tos').click();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(
      page.getByRole('heading', { name: 'You are in the review queue.' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Current status: in_review/)).toBeVisible();
  });

  test('an existing account signs in and resumes its application', async ({
    page,
  }) => {
    const account = uniqueAccount();
    await createAccount(page, account);
    await page.locator('#signup-name').fill(account.business);
    await page.getByRole('button', { name: 'Continue to documents' }).click();
    await expect(
      page.getByRole('heading', { name: 'Prove your business' }),
    ).toBeVisible({ timeout: 15_000 });

    // Come back cold, the way someone would the next morning.
    await page.context().clearCookies();
    await page.goto('/signup');
    await page.locator('#signup-contact').fill('Ada Obi');
    await page.locator('#signup-email').fill(account.email);
    await page.locator('#signup-password').fill(PASSWORD);
    await page
      .getByRole('button', { name: 'Create account and continue' })
      .click();

    // The email is taken, so the form offers sign-in rather than failing.
    await expect(
      page.getByRole('heading', { name: 'Sign in to continue' }),
    ).toBeVisible({ timeout: 15_000 });
    await page.locator('#signup-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in and continue' }).click();

    await expect(
      page.getByRole('heading', { name: 'You are in the review queue.' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('an anonymous request still cannot create a tenant', async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/tenants`, {
      data: { name: 'No Session Ltd', country: 'NG' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });
});
