'use client';

/**
 * Catches errors thrown by the root layout itself (e.g. the tenant-profile
 * fetch throwing unexpectedly) — must render its own <html>/<body> since
 * layout.tsx is bypassed. Kept deliberately unstyled: this fires before
 * globals.css/tokens can be trusted to have loaded.
 */
export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <h1>Something went wrong</h1>
        <p>Please try again, or rescan the code.</p>
        <button onClick={reset} style={{ marginTop: 16, padding: '8px 16px' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
