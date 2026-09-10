export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg px-s4 py-s10 flex min-h-screen items-center justify-center">
      <div className="space-y-s8 w-full max-w-md">
        <div className="gap-s3 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="bg-brand text-brand-ink grid h-12 w-12 place-content-center rounded-sm text-lg font-bold"
          >
            V
          </span>
          <h1 className="text-fg text-xl font-semibold tracking-tight">
            Verify Admin
          </h1>
        </div>
        <div
          data-testid="auth-card"
          className="border-border bg-surface p-s6 sm:p-s8 rounded-md border shadow-md"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
