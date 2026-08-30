'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border text-center shadow-lg">
      <h1 className="text-fg text-xl font-semibold">Something went wrong</h1>
      <p className="mt-s3 text-fg-muted text-sm">
        Please try again, or rescan the code.
      </p>
      <button
        onClick={reset}
        className="mt-s6 bg-fg py-s3 text-surface w-full rounded-md text-sm font-semibold transition hover:opacity-90"
      >
        Try again
      </button>
    </section>
  );
}
