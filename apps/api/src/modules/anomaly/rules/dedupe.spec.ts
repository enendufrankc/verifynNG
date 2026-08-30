import { describe, expect, it } from 'vitest';
import { bucketFor, computeDedupeKey } from './dedupe';

describe('bucketFor', () => {
  it('uses day granularity for geo_dispersion, dead_code, and pre_reveal', () => {
    const at = new Date('2026-08-30T23:59:00.000Z');
    expect(bucketFor('geo_dispersion', at)).toBe('2026-08-30');
    expect(bucketFor('dead_code', at)).toBe('2026-08-30');
    expect(bucketFor('pre_reveal', at)).toBe('2026-08-30');
  });

  it('uses hour granularity for velocity and duplicate_first', () => {
    const at = new Date('2026-08-30T23:59:00.000Z');
    expect(bucketFor('velocity', at)).toBe('2026-08-30T23');
    expect(bucketFor('duplicate_first', at)).toBe('2026-08-30T23');
  });
});

describe('computeDedupeKey', () => {
  it('is stable for repeated calls with the same inputs', () => {
    const args = {
      tenantId: 't1',
      rule: 'velocity' as const,
      keyPart: 'ip1',
      at: new Date('2026-08-30T12:05:00Z'),
      source: 'event' as const,
    };
    expect(computeDedupeKey(args)).toBe(computeDedupeKey(args));
  });

  it('differs across hour buckets for velocity', () => {
    const base = {
      tenantId: 't1',
      rule: 'velocity' as const,
      keyPart: 'ip1',
      source: 'event' as const,
    };
    const k1 = computeDedupeKey({
      ...base,
      at: new Date('2026-08-30T12:05:00Z'),
    });
    const k2 = computeDedupeKey({
      ...base,
      at: new Date('2026-08-30T13:05:00Z'),
    });
    expect(k1).not.toBe(k2);
  });

  it('separates event and sweep lineage for geo_dispersion and dead_code', () => {
    const base = {
      tenantId: 't1',
      rule: 'geo_dispersion' as const,
      keyPart: 'unit1',
      at: new Date('2026-08-30T12:00:00Z'),
    };
    const eventKey = computeDedupeKey({ ...base, source: 'event' });
    const sweepKey = computeDedupeKey({ ...base, source: 'sweep' });
    expect(eventKey).not.toBe(sweepKey);
  });

  it('does not append a source suffix for rules that only ever trigger one way', () => {
    const base = {
      tenantId: 't1',
      rule: 'duplicate_first' as const,
      keyPart: 'unit1',
      at: new Date('2026-08-30T12:00:00Z'),
    };
    expect(computeDedupeKey({ ...base, source: 'event' })).toBe(
      computeDedupeKey({ ...base, source: 'sweep' }),
    );
  });
});
