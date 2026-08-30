import { describe, expect, it } from 'vitest';
import { currentMonthUtc, monthRangeUtc, previousMonthUtc } from './month.util';

describe('month.util', () => {
  it('formats the current UTC month', () => {
    expect(currentMonthUtc(new Date('2026-08-30T23:59:59.000Z'))).toBe(
      '2026-08',
    );
  });

  it('rolls the previous month back across a year boundary', () => {
    expect(previousMonthUtc(new Date('2026-01-15T00:00:00.000Z'))).toBe(
      '2025-12',
    );
  });

  it('computes an inclusive-start/exclusive-end UTC range for a month', () => {
    const { start, end } = monthRangeUtc('2026-02');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('handles December → January rollover in monthRangeUtc', () => {
    const { start, end } = monthRangeUtc('2025-12');
    expect(start.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects a malformed month string', () => {
    expect(() => monthRangeUtc('2026-2')).toThrow();
  });
});
