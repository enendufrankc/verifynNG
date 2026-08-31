import { describe, expect, it } from 'vitest';
import { BillingClock } from './billing-clock.service';

// @verifynng/config's loadEnv() memoizes its parsed result at module scope
// (see packages/config/src/index.ts) for the lifetime of the process — it
// has no cache-bust hook, so mutating process.env.BILLING_CLOCK_SKEW_SECONDS
// between test cases in the same vitest worker doesn't take effect once
// another test file has already called loadEnv(). The compression path
// (skew > 0) is instead verified live against docker compose for AC5,
// where the env var is genuinely fixed for the container's lifetime — the
// same way a real demo would set it.
describe('BillingClock (default env: no clock skew)', () => {
  const clock = new BillingClock();

  it('daysToMs uses real days when BILLING_CLOCK_SKEW_SECONDS is 0 (test env default)', () => {
    expect(clock.daysToMs(7)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('addDays advances a date by real days', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = clock.addDays(from, 5);
    expect(to.getTime() - from.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it('now() returns the current time', () => {
    const before = Date.now();
    const now = clock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
