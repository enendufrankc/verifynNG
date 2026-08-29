export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand">
            <span className="text-brand-ink font-bold text-lg">V</span>
          </div>
          <h1 className="text-xl font-semibold text-fg">Verify Admin</h1>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          {children}
        </div>
      </div>
    </div>
  );
}
