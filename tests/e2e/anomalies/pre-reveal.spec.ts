import { test, expect } from '@playwright/test';
import {
  loginAs,
  mintTestBatch,
  setBatchStatus,
  verifyCode,
  waitForAnomaly,
} from '../fixtures/anomaly-helpers';

// AC4 — pre-reveal: a tier-2 code scanned before the batch's expected ship
// date raises a score-50 anomaly but never auto-flags the unit (alert-only
// by design — legitimate pre-ship handling is common) and emails the owner.
test.describe('AC4: pre-reveal @e07', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('raises an alert-only anomaly without flagging the unit', async ({
    page,
    request,
  }) => {
    const { batchId, units } = await mintTestBatch(
      request,
      1,
      `e07-e2e-ac4-${Date.now()}`,
    );

    const shipDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await setBatchStatus(request, batchId, 'shipped', shipDate);

    await verifyCode(request, units[0].tier2Code, '10.1.1.1');

    const anomaly = await waitForAnomaly(request, {
      rule: 'pre_reveal',
      unitId: units[0].id,
    });
    expect(anomaly.score).toBe(50);

    await loginAs(page, 'owner');
    await page.goto(`/units/${units[0].id}`);
    await expect(
      page.getByText('active', { exact: true }).first(),
    ).toBeVisible();

    await page.goto(`/anomalies/${anomaly.id}`);
    await expect(page.getByText('Pre-reveal')).toBeVisible();
  });
});
