export default function ProductPageNotFound() {
  return (
    <div className="bg-bg px-s5 flex min-h-dvh flex-col items-center justify-center text-center">
      <h1 className="text-fg mb-s3 text-2xl font-semibold">
        This page is no longer available
      </h1>
      <p className="text-fg-muted max-w-sm">
        Verify your product directly to check whether it&apos;s genuine.
      </p>
      <a
        href="/verify"
        className="text-brand-text mt-s6 font-semibold underline"
      >
        Go to /verify
      </a>
    </div>
  );
}
