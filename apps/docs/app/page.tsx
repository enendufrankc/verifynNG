import Link from 'next/link';

export default function HomePage() {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">How verifynNG codes work</h1>
      <p className="mb-8 max-w-xl" style={{ color: 'var(--color-fg-muted)' }}>
        Plain-language docs for anyone who scans a code, applies a label, or
        builds against the API — consumers, brands, and printers alike.
      </p>
      <Link
        href="/docs"
        className="inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
        style={{ background: 'var(--color-brand-strong)' }}
      >
        Browse the docs →
      </Link>
    </div>
  );
}
