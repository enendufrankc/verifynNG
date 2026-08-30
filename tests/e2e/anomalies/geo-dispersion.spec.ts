import { test, expect } from '@playwright/test';
import {
  loginAs,
  mintTestBatch,
  verifyCode,
  waitForAnomaly,
  warmFakeGeo,
} from '../fixtures/anomaly-helpers';

// AC1 — geo dispersion: three verifies of one tier-2 code from Lagos, Accra,
// Nairobi raises one geo_dispersion anomaly, auto-flags the unit, and shows
// up correctly in web-admin.
test.describe('AC1: geo dispersion @e07', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('flags a unit scanned from three distinct cities', async ({
    page,
    request,
  }) => {
    const { units } = await mintTestBatch(
      request,
      3,
      `e07-e2e-ac1-${Date.now()}`,
    );
    const code = units[0].tier2Code;

    // Anomaly evaluation is async (BullMQ), so the verdict on the very next
    // verify call is racy — assert the anomaly and the resulting flagged
    // state via polling instead of the response to the 3rd verify.
    await warmFakeGeo(request, ['10.1.1.1', '10.3.1.1', '10.4.1.1']);
    await verifyCode(request, code, '10.1.1.1');
    await verifyCode(request, code, '10.3.1.1');
    await verifyCode(request, code, '10.4.1.1');

    const anomaly = await waitForAnomaly(request, {
      rule: 'geo_dispersion',
      unitId: units[0].id,
    });
    expect(anomaly.score).toBe(60);

    await loginAs(page, 'owner');
    await page.goto(`/anomalies/${anomaly.id}`);
    await expect(page.getByText('Geo dispersion')).toBeVisible();

    await page.goto(`/units/${units[0].id}`);
    await expect(
      page.getByText('flagged', { exact: true }).first(),
    ).toBeVisible();
  });
});
