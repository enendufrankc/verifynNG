const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;

/** Parses and clamps the `limit` query param — 1–200, default 50. */
export function parseLimit(raw?: string): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_LIMIT;
  if (Number.isNaN(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

/** Opaque cursor over `createdAt|id` — see docs/epics/E16-public-api-webhooks.md T4. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separatorIndex = decoded.lastIndexOf('|');
    if (separatorIndex === -1) return null;
    const iso = decoded.slice(0, separatorIndex);
    const id = decoded.slice(separatorIndex + 1);
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Trims a page fetched with `take: limit + 1` down to `limit` items and
 * derives the next opaque cursor from the last kept row.
 */
export function paginate<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
