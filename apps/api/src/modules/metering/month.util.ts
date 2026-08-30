/** All month arithmetic here is UTC-only — a tenant's local timezone never enters it. */

export function currentMonthUtc(now: Date = new Date()): string {
  return formatMonth(now);
}

export function previousMonthUtc(now: Date = new Date()): string {
  const prev = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  return formatMonth(prev);
}

export function monthRangeUtc(month: string): { start: Date; end: Date } {
  const { year, monthIndex } = parseMonth(month);
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

function formatMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`invalid month "${month}", expected "YYYY-MM"`);
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}
