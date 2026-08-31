export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Wraps a single-page fetcher into an async generator that walks every page
 * via `nextCursor`, yielding one item at a time — `for await (const x of
 * client.batches.listAll())`.
 */
export async function* paginateAll<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const item of page.data) yield item;
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}
