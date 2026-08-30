import Link from 'next/link';

export default function Home() {
  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border text-center shadow-lg">
      <h1 className="text-fg font-sans text-2xl font-semibold">
        Verify your product
      </h1>
      <p className="mt-s3 text-fg-muted text-sm">
        Scan the QR code on your product, or enter its code below to check
        it&rsquo;s genuine.
      </p>
      <Link
        href="/verify"
        className="mt-s6 bg-brand py-s3 text-brand-ink block w-full rounded-md text-sm font-semibold transition hover:opacity-90"
      >
        Enter a code
      </Link>
    </section>
  );
}
