import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from './webhook-backoff.js';

describe('computeBackoffMs', () => {
  const base = 30_000; // 30s
  const max = 24 * 60 * 60 * 1000; // 24h

  it.each([
    [1, 60_000],
    [2, 120_000],
    [3, 240_000],
    [5, 960_000],
    [9, 15_360_000],
  ])(
    'attempt %i stays within 50-100%% of base × 2^attempts, capped at 24h',
    (attempts, exponential) => {
      const capped = Math.min(max, exponential);
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffMs(attempts, base, max);
        expect(delay).toBeGreaterThanOrEqual(Math.round(capped * 0.5));
        expect(delay).toBeLessThanOrEqual(capped);
      }
    },
  );

  it('never exceeds the 24h cap even for a large attempt count', () => {
    const delay = computeBackoffMs(20, base, max);
    expect(delay).toBeLessThanOrEqual(max);
    expect(delay).toBeGreaterThanOrEqual(Math.round(max * 0.5));
  });

  it('always returns a positive delay', () => {
    for (let attempts = 1; attempts <= 10; attempts++) {
      expect(computeBackoffMs(attempts, base, max)).toBeGreaterThan(0);
    }
  });
});
