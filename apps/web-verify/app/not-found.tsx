import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border text-center shadow-lg">
      <h1 className="text-fg text-xl font-semibold">Page not found</h1>
      <p className="mt-s3 text-fg-muted text-sm">
        Scanned a QR code? Try the link again, or enter the code manually.
      </p>
      <Link
        href="/verify"
        className="mt-s6 bg-fg py-s3 text-surface block w-full rounded-md text-sm font-semibold transition hover:opacity-90"
      >
        Enter a code
      </Link>
    </section>
  );
}
