export default function OrganizationSettingsPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Organization settings</h1>
      <p className="mt-2 text-slate-600">
        Manage your legal identity, branding, and lifecycle.
      </p>
      <section className="mt-8 rounded border p-6">
        <h2 className="text-xl font-medium">Branding</h2>
        <p className="mt-2 text-slate-600">
          Branding placeholders are ready for the product and verify
          experiences.
        </p>
      </section>
      <section className="mt-6 rounded border border-red-200 p-6">
        <h2 className="text-xl font-medium text-red-700">Danger zone</h2>
        <p className="mt-2 text-slate-600">
          Export your tenant data before confirming offboarding.
        </p>
      </section>
    </main>
  );
}
