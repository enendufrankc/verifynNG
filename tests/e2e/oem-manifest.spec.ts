import { test, expect, type Page } from '@playwright/test';

// Targets web-admin only — run with `pnpm test:e2e --project web-admin-desktop`.
// tests/e2e/fixtures/auth.ts's loginAs() is still E02/E11's unimplemented stub
// (a bare `page.goto('/')`), so this drives the real login form directly
// rather than depending on it.
const DEV_PASSWORD = 'Passw0rd!Passw0rd!';
const MAILPIT_API = process.env.MAILPIT_API_URL ?? 'http://localhost:8025/api';

async function loginViaForm(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

test.describe('E05 OEM Manifest Delivery @e2e', () => {
  test('AC1: owner delivers the seeded minted batch to Guangzhou Pack Co.', async ({
    page,
    request,
  }) => {
    await loginViaForm(page, 'owner@ivoryglow.local');

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

    // Mailpit receives the manifest.delivered email addressed to the OEM.
    // Not using fixtures/mailpit.ts's waitFor() here: its `To` extraction
    // assumes a plain string, but Mailpit's real /v1/messages response shape
    // is `To: [{ Name, Address }]`, and a delivery sends this subject to both
    // the OEM and the tenant owner, so the first match isn't necessarily the
    // OEM's — this polls and filters directly against the real shape instead.
    await expect
      .poll(
        async () => {
          const res = await request.get(`${MAILPIT_API}/v1/messages`);
          const body = (await res.json()) as {
            messages?: Array<{
              Subject?: string;
              To?: Array<{ Address: string }>;
            }>;
          };
          return (body.messages ?? []).some(
            (m) =>
              m.Subject?.includes('Manifest delivered') &&
              m.To?.some(
                (t) => t.Address.toLowerCase() === 'oem@guangzhou-pack.test',
              ),
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test("AC-ish: the OEM portal shows the factory's own deliveries, not the tenant console", async ({
    page,
  }) => {
    await loginViaForm(page, 'oem@guangzhou-pack.test');

    // Login with no `next` param routes an oem-role user straight to the portal.
    await page.waitForURL(/\/oem\/deliveries/, { timeout: 15_000 });
    await expect(page.getByText('OEM Portal')).toBeVisible();

    // A tenant console page (nav sidebar) is not reachable from here.
    await expect(page.getByText('Deliveries', { exact: true })).toHaveCount(0);
  });
});
