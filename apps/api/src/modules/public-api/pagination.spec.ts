import { describe, it, expect } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  paginate,
  parseLimit,
} from './pagination.js';

describe('cursor encode/decode', () => {
  it('round-trips createdAt + id', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const cursor = encodeCursor(createdAt, 'row-1');
    expect(decodeCursor(cursor)).toEqual({ createdAt, id: 'row-1' });
  });

  it('rejects a tampered/garbage cursor without throwing', () => {
    expect(decodeCursor('not-base64url-!!!')).toBeNull();
    expect(
      decodeCursor(Buffer.from('no-separator').toString('base64url')),
    ).toBeNull();
    expect(
      decodeCursor(Buffer.from('not-a-date|row-1').toString('base64url')),
    ).toBeNull();
  });
});

describe('parseLimit', () => {
  it('defaults to 50 when absent', () => {
    expect(parseLimit(undefined)).toBe(50);
  });

  it('clamps below 1 up to 1, and above 200 down to 200', () => {
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('-5')).toBe(1);
    expect(parseLimit('500')).toBe(200);
  });

  it('falls back to 50 for a non-numeric value', () => {
    expect(parseLimit('abc')).toBe(50);
  });

  it('passes through a valid value unchanged', () => {
    expect(parseLimit('75')).toBe(75);
  });
});

describe('paginate', () => {
  const row = (id: string, createdAt: string) => ({
    id,
    createdAt: new Date(createdAt),
  });

  it('returns nextCursor null when there is no extra row', () => {
    const rows = [
      row('a', '2026-01-03T00:00:00Z'),
      row('b', '2026-01-02T00:00:00Z'),
    ];
    const page = paginate(rows, 2);
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('trims to limit and derives nextCursor from the last kept row when there is an extra row', () => {
    const rows = [
      row('a', '2026-01-03T00:00:00Z'),
      row('b', '2026-01-02T00:00:00Z'),
      row('c', '2026-01-01T00:00:00Z'),
    ];
    const page = paginate(rows, 2);
    expect(page.data.map((r) => r.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe(encodeCursor(rows[1].createdAt, 'b'));
  });
});
