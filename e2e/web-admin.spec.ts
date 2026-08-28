import { test, expect } from '@playwright/test';

test.describe('web-admin smoke', () => {
  test('loads and shows API status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Verify Admin');
    await expect(page.getByText(/ok|down/i)).toBeVisible({ timeout: 15_000 });
  });
});
