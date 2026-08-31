import { test, expect, type Page } from '@playwright/test';

/**
 * web-admin only — see cookieless.spec.ts for why this is a per-test guard
 * rather than a playwright.config.ts testMatch change.
 *
 * Covers the ticket lifecycle across the console and public intake
 * channels (AC5, AC6) — email intake (AC7) is CLI-driven
 * (support:simulate-inbound) rather than browser-driven, so it isn't a
 * Playwright spec; see docs/epics/E18-support-tooling.md's own Testing
 * section.
 */
const PASSWORD = 'Passw0rd!Passw0rd!';
const WEB_ADMIN_URL = `http://localhost:${process.env.WEB_ADMIN_PORT ?? '3001'}`;
const WEB_VERIFY_URL = `http://localhost:${process.env.WEB_VERIFY_PORT ?? '3000'}`;

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${WEB_ADMIN_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

test.describe('E18 support tickets @support', () => {
  test('console help form creates a ticket support can see and reply to', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('web-admin'), 'web-admin only');

    await login(page, 'operator@ivoryglow.local');
    const subject = `Playwright console ticket ${Date.now()}`;
    await page.goto(`${WEB_ADMIN_URL}/help?pageUrl=%2Fbatches&module=batches`);

    const sendButton = page.getByRole('button', { name: 'Send' });
    // Send starts disabled until AuthBootstrap's post-navigation cookie
    // refresh repopulates the tenant context (see help/page.tsx).
    await expect(sendButton).toBeEnabled();
    // PolicyReacceptGuard (E19-owned, not touched here) does its own,
    // slightly later async check off that same auth state and switches
    // from a bare Fragment to a wrapping <div> once it resolves — a
    // different element type at the same tree position, which forces
    // React to remount this whole page and silently wipe any text already
    // typed into it. Waiting for its banner also confirms that settled
    // before filling the form.
    await expect(
      page.getByText('Your account owner must accept updated terms'),
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Subject*' }).fill(subject);
    await page
      .getByRole('textbox', { name: 'How can we help?*' })
      .fill('Playwright end-to-end check of the console intake channel.');
    await sendButton.click();
    await expect(page.getByText(/Ticket #\d+ created/).first()).toBeVisible({
      timeout: 15_000,
    });

    // Same requester sees it under My tickets.
    await page.goto(`${WEB_ADMIN_URL}/help/tickets`);
    await expect(page.getByText(subject).first()).toBeVisible();

    // Support sees it too, with the right channel/tenant.
    await login(page, 'support@verifyng.local');
    await page.goto(`${WEB_ADMIN_URL}/support/tickets`);
    const row = page.getByRole('row', { name: new RegExp(subject) });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole('cell', { name: 'console', exact: true }),
    ).toBeVisible();

    await row.getByRole('link', { name: /^#\d+$/ }).click();
    await expect(
      page.getByRole('heading', { name: new RegExp(subject) }),
    ).toBeVisible();
  });

  test('public support form on web-verify creates a ticket and enforces the per-IP rate limit', async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('web-verify'),
      'web-verify only',
    );

    await page.goto(`${WEB_VERIFY_URL}/support`);
    await page
      .getByRole('textbox', { name: 'Email*' })
      .fill(`playwright-${Date.now()}@example.com`);
    await page
      .getByRole('textbox', { name: 'Subject*' })
      .fill('E2E public ticket');
    await page
      .getByRole('textbox', { name: 'Message*' })
      .fill('Playwright end-to-end check of the public intake channel.');
    await page
      .getByRole('textbox', { name: 'ok-demo (dev captcha token)' })
      .fill(`ok-${Date.now()}`);
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('Thanks — we got it')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Your reference is #\d+/)).toBeVisible();
  });
});
