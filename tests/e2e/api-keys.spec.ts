import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth';

// AC1 — key lifecycle: create with scopes, one-time reveal, masked on
// reload, revoke.
test.describe('API keys @e16', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('create, reveal once, mask on reload, revoke', async ({ page }) => {
    await loginAs(page, 'owner');
    await page.goto('/api-keys');

    await page.getByRole('button', { name: 'Create key' }).click();
    const dialog = page.getByRole('dialog');
    const name = `e2e-${Date.now()}`;
    await page.getByPlaceholder('ERP integration').fill(name);
    await page.getByLabel('read:batches').check();
    await dialog.getByRole('button', { name: 'Create key' }).click();

    await expect(page.getByText('Save your API key')).toBeVisible();
    const key = await page.locator('pre code').innerText();
    expect(key).toMatch(/^vk_(live|test)_[0-9a-zA-Z]{32}$/);

    const doneButton = page.getByRole('button', { name: 'Done' });
    await expect(doneButton).toBeDisabled();
    await page.getByLabel('I have stored it').check();
    await expect(doneButton).toBeEnabled();
    await doneButton.click();
    await expect(page.getByText('Save your API key')).not.toBeVisible();

    await page.reload();
    const row = page.locator('table tbody tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(key);
    await expect(row.getByText(/^vk_(live|test)_.{4}…$/)).toBeVisible();

    await row.getByRole('button', { name: 'Revoke' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Revoke', exact: true })
      .click();
    await expect(row.getByText('Revoked')).toBeVisible();
  });
});
