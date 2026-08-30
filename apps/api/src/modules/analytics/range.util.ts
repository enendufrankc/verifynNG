import { startOfUtcDay } from './rollup/aggregate-scan-events';

export type RangeKey = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

export function isRangeKey(value: string | undefined): value is RangeKey {
  return value === '7d' || value === '30d' || value === '90d';
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * `end` is exclusive and is tomorrow's UTC midnight, so "today so far" is
 * included in the current window. `prior*` is the equal-length window
 * immediately before `start`, for the overview's deltas.
 */
export function rangeWindows(range: RangeKey, now: Date = new Date()) {
  const days = RANGE_DAYS[range];
  const end = addDaysUtc(startOfUtcDay(now), 1);
  const start = addDaysUtc(end, -days);
  const priorEnd = start;
  const priorStart = addDaysUtc(start, -days);
  return { start, end, priorStart, priorEnd };
}
