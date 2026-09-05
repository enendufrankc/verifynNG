'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface SearchablePage {
  slug: string;
  title: string;
  text: string;
}

/**
 * Client-side full-text search over the (small, fully static) doc corpus —
 * no search service needed at this scale. See AC9 ("search for 'scratch'
 * finds Applying labels").
 */
export function SearchBox({ pages }: { pages: SearchablePage[] }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q),
    );
  }, [query, pages]);

  return (
    <div className="mb-8">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the docs…"
        aria-label="Search the docs"
        className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--color-border)' }}
      />
      {query.trim() && (
        <ul className="mt-3 space-y-1">
          {results.length === 0 && (
            <li className="text-sm" style={{ color: 'var(--color-fg-muted)' }}>
              No results for &ldquo;{query}&rdquo;.
            </li>
          )}
          {results.map((r) => (
            <li key={r.slug}>
              <Link href={`/docs/${r.slug}`} className="text-sm underline">
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
