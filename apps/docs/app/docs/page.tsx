import Link from 'next/link';
import { getAllDocPages } from '@/lib/content';
import { SearchBox } from './search-box';

export default function DocsIndexPage() {
  const pages = getAllDocPages();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Documentation</h1>
      <p className="mb-6" style={{ color: 'var(--color-fg-muted)' }}>
        How product-authenticity codes work, how to apply labels, printer specs,
        console guides, and the API — everything here is public and
        unauthenticated on purpose.
      </p>
      <SearchBox
        pages={pages.map((p) => ({
          slug: p.slug,
          title: p.title,
          text: p.text,
        }))}
      />
      <ul className="space-y-2">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link href={`/docs/${p.slug}`} className="underline">
              {p.title}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/docs/api" className="underline">
            API
          </Link>
        </li>
      </ul>
    </div>
  );
}
