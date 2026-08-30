'use client';

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type TenantStatus =
  | 'pending'
  | 'in_review'
  | 'rejected'
  | 'active'
  | 'suspended'
  | 'restricted'
  | 'offboarded';

interface Branding {
  displayName?: string;
  primaryColor?: string;
  accentColor?: string;
  supportEmail?: string;
  websiteUrl?: string;
}

interface Tenant {
  id: string;
  name: string;
  legalName?: string | null;
  trademarkNumber?: string | null;
  country?: string | null;
  status: TenantStatus;
  branding?: Branding | null;
}

interface ExportState {
  status: string;
  downloadUrl?: string;
  scheduledDeletionAt?: string | null;
}

function errorMessage(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'string') return error.replaceAll('_', ' ');
  }
  return fallback;
}

function fieldValue(target: unknown) {
  return (target as { value: string }).value;
}

export default function OrganizationSettingsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    trademarkNumber: '',
    country: '',
    supportEmail: '',
    websiteUrl: '',
    primaryColor: '',
    accentColor: '',
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [exportState, setExportState] = useState<ExportState | null>(null);

  useEffect(() => {
    const location = (globalThis as unknown as { location: { search: string } })
      .location;
    setTenantId(
      new URLSearchParams(location.search).get('tenantId') ??
        localStorage.getItem('verifyng.tenantId'),
    );
  }, []);

  const request = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...init.headers,
        },
      }),
    [tenantId],
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    const response = await request(`/tenants/${tenantId}`);
    if (!response.ok) return;
    const loaded = (await response.json()) as Tenant;
    setTenant(loaded);
    setForm({
      name: loaded.name ?? '',
      legalName: loaded.legalName ?? '',
      trademarkNumber: loaded.trademarkNumber ?? '',
      country: loaded.country ?? '',
      supportEmail: loaded.branding?.supportEmail ?? '',
      websiteUrl: loaded.branding?.websiteUrl ?? '',
      primaryColor: loaded.branding?.primaryColor ?? '',
      accentColor: loaded.branding?.accentColor ?? '',
    });
    if (loaded.status === 'offboarded') {
      const exportResponse = await request(`/tenants/${tenantId}/export`);
      if (exportResponse.ok)
        setExportState((await exportResponse.json()) as ExportState);
    }
  }, [request, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!tenantId) return;
    setBusy(true);
    setMessage('');
    try {
      const branding: Branding = {};
      if (form.supportEmail) branding.supportEmail = form.supportEmail;
      if (form.websiteUrl) branding.websiteUrl = form.websiteUrl;
      if (form.primaryColor) branding.primaryColor = form.primaryColor;
      if (form.accentColor) branding.accentColor = form.accentColor;
      const response = await request(`/tenants/${tenantId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          legalName: form.legalName,
          trademarkNumber: form.trademarkNumber,
          country: form.country,
          ...(Object.keys(branding).length ? { branding } : {}),
        }),
      });
      if (!response.ok) {
        setMessage(
          errorMessage(await response.json(), 'Could not save settings.'),
        );
        return;
      }
      setTenant((await response.json()) as Tenant);
      setMessage('Settings saved.');
    } finally {
      setBusy(false);
    }
  };

  const offboard = async () => {
    if (!tenantId || !tenant) return;
    if (confirmSlug !== tenant.name) {
      setMessage(`Type "${tenant.name}" to confirm offboarding.`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await request(`/tenants/${tenantId}/offboard`, {
        method: 'POST',
        body: JSON.stringify({ confirmSlug }),
      });
      if (!response.ok) {
        setMessage(errorMessage(await response.json(), 'Could not offboard.'));
        return;
      }
      setMessage('Offboarding started. Your data export is being prepared.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const isSuspended =
    tenant?.status === 'suspended' || tenant?.status === 'restricted';
  const isOffboarded = tenant?.status === 'offboarded';

  if (!tenantId)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-slate-600">
          No tenant selected. Sign up or open this page with{' '}
          <code>?tenantId=…</code>.
        </p>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Organization settings</h1>
      <p className="mt-2 text-slate-600">
        Manage your legal identity, branding, and lifecycle.
      </p>

      {isSuspended && (
        <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Your account is suspended. Consumers can still verify your products,
          but the console is read-only until you reactivate.
        </div>
      )}

      <section className="mt-8 rounded border p-6">
        <h2 className="text-xl font-medium">Legal identity</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Business name
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              value={form.name}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: fieldValue(e.target) }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Legal name
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              value={form.legalName}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, legalName: fieldValue(e.target) }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Trademark number
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              value={form.trademarkNumber}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  trademarkNumber: fieldValue(e.target),
                }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Country
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              value={form.country}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, country: fieldValue(e.target) }))
              }
            />
          </label>
        </div>
      </section>

      <section className="mt-6 rounded border p-6">
        <h2 className="text-xl font-medium">Branding</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Support email
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              value={form.supportEmail}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, supportEmail: fieldValue(e.target) }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Website URL
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              value={form.websiteUrl}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, websiteUrl: fieldValue(e.target) }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Primary colour
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              placeholder="#000000"
              value={form.primaryColor}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, primaryColor: fieldValue(e.target) }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Accent colour
            <input
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              placeholder="#000000"
              value={form.accentColor}
              disabled={isSuspended || isOffboarded}
              onChange={(e) =>
                setForm((f) => ({ ...f, accentColor: fieldValue(e.target) }))
              }
            />
          </label>
        </div>
        <button
          className="mt-4 rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={busy || isSuspended || isOffboarded}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </section>

      {!isOffboarded && (
        <section className="mt-6 rounded border border-red-200 p-6">
          <h2 className="text-xl font-medium text-red-700">Danger zone</h2>
          <p className="mt-2 text-slate-600">
            Offboarding exports your data, then permanently deletes your
            products, batches, units, and scan history after a grace period.
          </p>
          <label className="mt-4 block text-sm font-medium">
            Type <strong>{tenant?.name}</strong> to confirm
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(fieldValue(e.target))}
            />
          </label>
          <button
            className="mt-4 rounded border border-red-600 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
            disabled={busy}
            onClick={offboard}
          >
            Offboard this organization
          </button>
        </section>
      )}

      {isOffboarded && (
        <section className="mt-6 rounded border p-6">
          <h2 className="text-xl font-medium">Data export</h2>
          <p className="mt-2 text-slate-600">
            Status: {exportState?.status ?? 'preparing'}
          </p>
          {exportState?.downloadUrl && (
            <a
              className="mt-4 inline-block rounded bg-slate-950 px-4 py-2 font-semibold text-white"
              href={exportState.downloadUrl}
            >
              Download export
            </a>
          )}
          {exportState?.scheduledDeletionAt && (
            <p className="mt-2 text-xs text-slate-500">
              Remaining data will be deleted on{' '}
              {new Date(exportState.scheduledDeletionAt).toLocaleString()}.
            </p>
          )}
        </section>
      )}

      {message && (
        <p
          role="alert"
          className="mt-6 rounded bg-red-50 p-4 text-sm text-red-800"
        >
          {message}
        </p>
      )}
    </main>
  );
}
