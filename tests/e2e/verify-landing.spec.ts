import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('platform landing @e09', () => {
  test('explains Verify and separates the example from a real result', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Build trust into every product.',
    );
    await expect(
      page.getByText('Illustrative verification result'),
    ).toBeVisible();
    await expect(
      page.getByText(/IVORY GLOW is a registered trademark/),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('link', { name: 'Protect your brand', exact: true })
        .first(),
    ).toHaveAttribute('href', /\/signup$/);
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveAttribute('href', /\/login$/);
  });

  test('takes product owners to signup and sign in', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Protect your brand', exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole('heading', { name: 'Create your account', exact: true }),
    ).toBeVisible();
    await page.goBack();
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await page.goto(new URL('/products', page.url()).toString());
    await expect(page).toHaveURL(/\/login\?next=%2Fproducts$/);
  });

  test('keeps verification accessible and restores the platform shell on back navigation', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Verify a product', exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await expect(
      page.getByText('Illustrative verification result'),
    ).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Build trust into every product.',
    );
    await expect(
      page.getByText(/IVORY GLOW is a registered trademark/),
    ).toHaveCount(0);
  });

  test('has accessible content and a keyboard skip link', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Skip to content' }),
    ).toBeFocused();
    await page.getByRole('link', { name: 'How it works', exact: true }).hover();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('fits narrow and wide screens', async ({ page }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  });

  test('offers real navigation without JavaScript', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL,
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Build trust into every product.',
    );
    await page
      .getByRole('link', { name: 'Verify a product', exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/verify$/);
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await context.close();
  });
});
