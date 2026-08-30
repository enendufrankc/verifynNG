export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="bg-brand mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
            <span className="text-brand-ink text-lg font-bold">V</span>
          </div>
          <h1 className="text-fg text-xl font-semibold">Verify Admin</h1>
        </div>
        <div className="border-border bg-surface rounded-lg border p-6 shadow-md">
          {children}
        </div>
      </div>
    </div>
  );
}
