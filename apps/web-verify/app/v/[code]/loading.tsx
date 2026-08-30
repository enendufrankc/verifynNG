/**
 * Shown automatically by Next while the async page component awaits E06
 * (route-level Suspense, no wiring needed here) — matches VerdictFrame's
 * geometry exactly so the real card doesn't shift layout on arrival (AC6:
 * CLS < 0.1 on a slow connection).
 */
export default function Loading() {
  return (
    <section
      className="border-border bg-surface relative w-full max-w-md overflow-hidden rounded-lg border shadow-lg"
      aria-hidden="true"
    >
      <div className="bg-surface-sunken h-1.5 w-full animate-pulse" />
      <div className="p-s8">
        <div className="bg-surface-sunken mb-s5 mx-auto h-16 w-16 animate-pulse rounded-full" />
        <div className="bg-surface-sunken mx-auto h-7 w-40 animate-pulse rounded" />
        <div className="mt-s3 space-y-s2">
          <div className="bg-surface-sunken mx-auto h-4 w-full animate-pulse rounded" />
          <div className="bg-surface-sunken mx-auto h-4 w-5/6 animate-pulse rounded" />
        </div>
        <div className="mt-s6 space-y-s3 border-border pt-s6 border-t">
          <div className="bg-surface-sunken h-5 w-full animate-pulse rounded" />
          <div className="bg-surface-sunken h-5 w-full animate-pulse rounded" />
        </div>
      </div>
    </section>
  );
}
