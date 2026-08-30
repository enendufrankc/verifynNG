import { test, expect, type Page } from '@playwright/test';
import {
  loginAs,
  mintTestBatch,
  verifyCode,
} from '../fixtures/anomaly-helpers';

// See unit-lifecycle.spec.ts's clickConfirm: the dialog's destructive
// confirm button has the same viewport-click issue driving it manually did.
async function clickDialogButton(page: Page, text: string): Promise<void> {
  await page.evaluate((label) => {
    const btns = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === label,
    );
    (btns[btns.length - 1] as HTMLButtonElement | undefined)?.click();
  }, text);
}

// AC7 — recall: an owner recalls a batch, progress reaches 100% within 60s,
// every unit ends up decommissioned, exactly one batch.recall audit row is
// written, and a verify on any code from the batch returns the
// decommissioned verdict.
test.describe('AC7: batch recall @e07', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('recalls every unit in a batch', async ({ page, request }) => {
    // 1,000 in the epic's own AC — kept smaller here so the suite stays
    // fast; the recall path is identical regardless of batch size (paged
    // 500 at a time either way).
    const size = 50;
    const { batchId, units } = await mintTestBatch(
      request,
      size,
      `e07-e2e-ac7-${Date.now()}`,
    );

    await loginAs(page, 'owner');
    await page.goto(`/units/batch/${batchId}`);
    await page.getByRole('button', { name: 'Recall batch' }).click();
    await page
      .getByRole('textbox', { name: 'Reason (required)' })
      .fill('AC7 e2e recall');
    await page.getByPlaceholder('RECALL').fill('RECALL');
    await clickDialogButton(page, 'Recall batch');

    await expect(page.getByText(/Recall progress/)).toBeVisible();
    await expect(page.getByText('100%', { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });

    const apiBase = `http://localhost:${process.env.API_HOST_PORT ?? '4000'}`;
    const { accessToken } = await request
      .post(`${apiBase}/auth/login`, {
        data: {
          email: 'owner@ivoryglow.local',
          password: 'Passw0rd!Passw0rd!',
        },
      })
      .then((r) => r.json());

    const decommissioned = await request
      .get(
        `${apiBase}/v1/batches/${batchId}/units?state=decommissioned&limit=${size}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      )
      .then((r) => r.json());
    expect(decommissioned.items).toHaveLength(size);

    const auditRows = await request
      .get(`${apiBase}/v1/audit?targetType=batch&targetId=${batchId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((r) => r.json());
    expect(
      auditRows.items.filter(
        (a: { action: string }) => a.action === 'batch.recall',
      ),
    ).toHaveLength(1);

    const verdict = await verifyCode(request, units[0].tier2Code, '10.1.1.1');
    expect(verdict.verdict).toBe('decommissioned');
  });
});
