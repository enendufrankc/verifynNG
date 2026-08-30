import { test, expect } from '@playwright/test';
import { loginAs, mailpit } from './fixtures/index.js';

// Targets web-admin only — run with `pnpm test:e2e --project web-admin-desktop`.

test.describe('E05 OEM Manifest Delivery @e2e', () => {
  test('AC1: owner delivers the seeded minted batch to Guangzhou Pack Co.', async ({
    page,
    request,
  }) => {
    await loginAs(page, 'owner');

    await page.goto('/deliveries');
    await page.getByRole('button', { name: /deliver batch/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('combobox', { name: /batch/i }).click();
    await page.getByRole('option').first().click();

    await page.getByRole('combobox', { name: /oem/i }).click();
    await page.getByRole('option', { name: 'Guangzhou Pack Co.' }).click();

    const shipDate = new Date(Date.now() + 14 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.locator('#deliver-ship-date').fill(shipDate);

    await page.getByRole('button', { name: /^deliver$/i }).click();

    // The dialog closes and the new row shows up as "delivered".
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
    await expect(
      page.getByRole('cell', { name: 'Guangzhou Pack Co.' }).first(),
    ).toBeVisible();
    await expect(page.getByText('delivered').first()).toBeVisible();

    // Mailpit receives the manifest.delivered email addressed to the OEM
    // (a delivery also emails the tenant owner with the same subject, so the
    // `to` filter matters — the first match by subject alone isn't
    // necessarily the OEM's).
    const email = await mailpit.waitFor(request, 'Manifest delivered', {
      to: 'oem@guangzhou-pack.test',
    });
    expect(email.to.map((a) => a.toLowerCase())).toContain(
      'oem@guangzhou-pack.test',
    );
  });

  test("AC-ish: the OEM portal shows the factory's own deliveries, not the tenant console", async ({
    page,
  }) => {
    await loginAs(page, 'oem');

    // Login with no `next` param routes an oem-role user straight to the portal.
    await page.waitForURL(/\/oem\/deliveries/, { timeout: 15_000 });
    await expect(page.getByText('OEM Portal')).toBeVisible();

    // A tenant console page (nav sidebar) is not reachable from here.
    await expect(page.getByText('Deliveries', { exact: true })).toHaveCount(0);
  });
});
