import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth';
import { webhookSink } from './fixtures/webhook';

// AC6/AC7 — webhook lifecycle: create an endpoint pointed at
// tools/fakes/webhook-sink, send a test ping, see it succeed in the
// delivery log, force a failure, then redeliver back to success.
test.describe('Webhooks @e16', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('create -> test-send -> delivery log -> redeliver', async ({
    page,
    request,
  }) => {
    const sinkName = `e2e-${Date.now()}`;
    await webhookSink.clear(request);

    await loginAs(page, 'owner');
    await page.goto('/webhooks');

    await page.getByRole('button', { name: 'Add endpoint' }).click();
    const createDialog = page.getByRole('dialog');
    await page
      .getByPlaceholder('https://erp.example.com/webhooks/verifyng')
      .fill(`http://webhook-sink:4105/hook/${sinkName}`);
    await page.getByLabel('unit.flagged').check();
    await createDialog.getByRole('button', { name: 'Add endpoint' }).click();

    await expect(page.getByText('Save your webhook secret')).toBeVisible();
    const secret = await page.locator('pre code').innerText();
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    await page.getByLabel('I have stored it').check();
    await page.getByRole('button', { name: 'Done' }).click();

    const row = page.locator('table tbody tr', {
      hasText: `hook/${sinkName}`,
    });
    await expect(row).toBeVisible();

    // Happy path: ping succeeds.
    await row.getByRole('button', { name: 'Send test' }).click();
    await expect(
      page.getByText('Test delivery succeeded', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    const ping = await webhookSink.waitFor(request, sinkName, 'ping');
    expect(ping.respondedStatus).toBe(200);

    // Force a failure, confirm it shows up as failed, then redeliver.
    await webhookSink.setBehaviour(request, sinkName, 500);
    await row.getByRole('button', { name: 'Send test' }).click();
    await expect(
      page.getByText('Test delivery failed', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    await row.getByRole('link', { name: /Deliveries/ }).click();
    await page.waitForURL(/\/webhooks\/.+\/deliveries/);
    const failedRow = page.locator('table tbody tr', { hasText: 'failed' });
    await expect(failedRow).toBeVisible();

    await webhookSink.setBehaviour(request, sinkName, 200);
    await failedRow.getByRole('button', { name: 'Redeliver' }).click();
    await expect(
      page.getByText('Redelivery queued', { exact: true }),
    ).toBeVisible();

    // The delivery log doesn't poll — the BullMQ job settles asynchronously,
    // so reload until it shows up succeeded (matches AC7's manual "click
    // Redeliver -> succeeded" check).
    await expect(async () => {
      await page.reload();
      await expect(
        page.locator('table tbody tr').filter({ hasText: 'succeeded' }),
      ).toHaveCount(2);
    }).toPass({ timeout: 10_000 });
  });
});
