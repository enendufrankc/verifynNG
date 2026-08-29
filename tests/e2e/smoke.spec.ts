import { test, expect } from '@playwright/test';

test.describe('smoke @smoke', () => {
  test('page loads with expected heading', async ({ page }) => {
    await page.goto('/');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});
