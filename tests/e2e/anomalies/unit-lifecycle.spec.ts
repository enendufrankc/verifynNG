import { test, expect, type Page } from '@playwright/test';
import { loginAs, mintTestBatch, signOut } from '../fixtures/anomaly-helpers';

// The reason-dialog's Confirm button sits below the fold in a way Playwright's
// scroll-then-click can't resolve (radix Dialog content positioning) — the
// same thing happened driving this manually; a DOM-level click sidesteps it.
async function clickConfirm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Confirm',
    );
    (btn as HTMLButtonElement | undefined)?.click();
  });
}

// AC6 — lifecycle: an operator can flag a unit but not decommission it; an
// owner can then decommission and restore it, producing three transition
// rows (checked against the audit log via the API, matching the epic's
// GET /v1/audit?targetType=unit&targetId=<id> assertion).
test.describe('AC6: unit lifecycle @e07', () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('operator flags, decommission disabled; owner decommissions and restores', async ({
    page,
    request,
  }) => {
    const { units } = await mintTestBatch(
      request,
      1,
      `e07-e2e-ac6-${Date.now()}`,
    );
    const unitId = units[0].id;

    await loginAs(page, 'operator');
    await page.goto(`/units/${unitId}`);
    await expect(
      page.getByRole('button', { name: 'Decommission' }),
    ).toBeDisabled();

    await page.getByRole('button', { name: 'Flag', exact: true }).click();
    await page.getByRole('textbox', { name: 'Reason' }).fill('test');
    await clickConfirm(page);
    await expect(
      page.getByText('flagged', { exact: true }).first(),
    ).toBeVisible();

    await signOut(page);
    await loginAs(page, 'owner');
    await page.goto(`/units/${unitId}`);

    await page.getByRole('button', { name: 'Decommission' }).click();
    await page
      .getByRole('textbox', { name: 'Reason' })
      .fill('decommission test');
    await clickConfirm(page);
    await expect(
      page.getByText('decommissioned', { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).click();
    await page.getByRole('textbox', { name: 'Reason' }).fill('restore test');
    await clickConfirm(page);
    await expect(
      page.getByText('active', { exact: true }).first(),
    ).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('decommission test');
    expect(bodyText).toContain('restore test');

    const { accessToken } = await request
      .post(
        `http://localhost:${process.env.API_HOST_PORT ?? '4000'}/auth/login`,
        {
          data: {
            email: 'owner@ivoryglow.local',
            password: 'Passw0rd!Passw0rd!',
          },
        },
      )
      .then((r) => r.json());
    const audit = await request
      .get(
        `http://localhost:${process.env.API_HOST_PORT ?? '4000'}/v1/audit?targetType=unit&targetId=${unitId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      .then((r) => r.json());
    expect(audit.items).toHaveLength(3);
  });
});
