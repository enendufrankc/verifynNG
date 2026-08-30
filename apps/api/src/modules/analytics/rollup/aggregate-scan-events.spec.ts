import { describe, expect, it } from 'vitest';
import {
  aggregateScanEvents,
  startOfUtcDay,
  type ScanEventLike,
} from './aggregate-scan-events';

function event(overrides: Partial<ScanEventLike> = {}): ScanEventLike {
  return {
    tenantId: 'tenant-1',
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    productId: 'product-1',
    batchId: 'batch-1',
    tier: 'tier2',
    verdict: 'authentic',
    ipHash: 'ip-a',
    geoCountry: 'NG',
    geoCity: 'Lagos',
    ...overrides,
  };
}

describe('aggregateScanEvents', () => {
  it('groups by tenant/day/product/batch/tier/verdict and counts', () => {
    const rows = aggregateScanEvents([
      event(),
      event(),
      event({ verdict: 'suspicious' }),
    ]);
    expect(rows).toHaveLength(2);
    const authentic = rows.find((r) => r.verdict === 'authentic')!;
    expect(authentic.count).toBe(2);
    expect(authentic.tier).toBe(2);
    expect(authentic.date.toISOString()).toBe('2026-08-30T00:00:00.000Z');
  });

  it('counts distinct IPs, not raw event count', () => {
    const rows = aggregateScanEvents([
      event({ ipHash: 'ip-a' }),
      event({ ipHash: 'ip-a' }),
      event({ ipHash: 'ip-b' }),
      event({ ipHash: null }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(4);
    expect(rows[0].distinctIpCount).toBe(2);
  });

  it('truncates topCountries to the top 10 by count, descending', () => {
    const events: ScanEventLike[] = [];
    for (let i = 0; i < 12; i++) {
      const country = `C${i}`;
      const hits = 12 - i; // C0 has the most hits, C11 the fewest
      for (let h = 0; h < hits; h++) {
        events.push(
          event({
            geoCountry: country,
            geoCity: undefined,
            ipHash: `ip-${i}-${h}`,
          }),
        );
      }
    }
    const rows = aggregateScanEvents(events);
    expect(rows).toHaveLength(1);
    expect(rows[0].topCountries).toHaveLength(10);
    expect(rows[0].topCountries[0]).toMatchObject({ country: 'C0', count: 12 });
    expect(rows[0].topCountries.map((c) => c.country)).not.toContain('C11');
  });

  it('maps tier1/tier2 strings to numeric 1/2', () => {
    const rows = aggregateScanEvents([
      event({ tier: 'tier1' }),
      event({ tier: 'tier2' }),
    ]);
    expect(rows.map((r) => r.tier).sort()).toEqual([1, 2]);
  });

  it('keeps null productId/batchId as their own bucket', () => {
    const rows = aggregateScanEvents([
      event({ productId: null, batchId: null }),
      event({ productId: 'product-1', batchId: 'batch-1' }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('returns an empty array for no events', () => {
    expect(aggregateScanEvents([])).toEqual([]);
  });
});

describe('startOfUtcDay', () => {
  it('truncates to midnight UTC', () => {
    expect(
      startOfUtcDay(new Date('2026-08-30T23:59:59.999Z')).toISOString(),
    ).toBe('2026-08-30T00:00:00.000Z');
  });
});
