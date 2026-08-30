'use client';

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ReviewTenant {
  id: string;
  name: string;
  country?: string | null;
  status: string;
  verificationDocuments?: { id: string }[];
}

interface Document {
  id: string;
  kind: string;
  fileName: string;
  viewUrl: string;
}

function errorMessage(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'string') return error.replaceAll('_', ' ');
  }
  return fallback;
}

export default function TenantReviewPage() {
  const [tenants, setTenants] = useState<ReviewTenant[]>([]);
  const [selected, setSelected] = useState<ReviewTenant | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reasonPrompt, setReasonPrompt] = useState<{
    action: 'reject' | 'suspend';
    reason: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const request = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-platform-role': 'support',
          'x-user-id': 'support-agent',
          ...init.headers,
        },
      }),
    [],
  );

  const loadQueue = useCallback(async () => {
    const response = await request('/support/tenants?status=in_review');
    if (response.ok) setTenants((await response.json()) as ReviewTenant[]);
  }, [request]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const openTenant = async (tenant: ReviewTenant) => {
    setSelected(tenant);
    setMessage('');
    const response = await request(
      `/support/tenants/${tenant.id}/verification`,
    );
    setDocuments(response.ok ? ((await response.json()) as Document[]) : []);
  };

  const runAction = async (path: string, body?: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await request(`/support/tenants/${selected.id}${path}`, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        setMessage(errorMessage(await response.json(), 'Action failed.'));
        return;
      }
      setMessage('Done.');
      setSelected(null);
      setReasonPrompt(null);
      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Tenant review</h1>
      <p className="mt-2 text-slate-600">
        Businesses waiting for identity verification.
      </p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="overflow-hidden rounded border">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4">Business</th>
                <th className="p-4">Country</th>
                <th className="p-4">Documents</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr
                  key={tenant.id}
                  className={`cursor-pointer border-t hover:bg-slate-50 ${selected?.id === tenant.id ? 'bg-slate-100' : ''}`}
                  onClick={() => openTenant(tenant)}
                >
                  <td className="p-4">{tenant.name}</td>
                  <td className="p-4">{tenant.country}</td>
                  <td className="p-4">
                    {tenant.verificationDocuments?.length ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tenants.length === 0 && (
            <p className="p-6 text-slate-500">
              No tenants are waiting for review.
            </p>
          )}
        </div>

        {selected && (
          <div className="rounded border p-6">
            <h2 className="text-xl font-semibold">{selected.name}</h2>
            <p className="text-sm text-slate-500">{selected.country}</p>

            <div className="mt-4 space-y-3">
              {documents.map((document) => (
                <a
                  key={document.id}
                  href={document.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded border p-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  View {document.kind.replaceAll('_', ' ')} —{' '}
                  {document.fileName}
                </a>
              ))}
              {documents.length === 0 && (
                <p className="text-sm text-slate-500">No documents yet.</p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={busy}
                className="rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
                onClick={() => runAction('/approve')}
              >
                Approve
              </button>
              <button
                disabled={busy}
                className="rounded border border-red-600 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
                onClick={() =>
                  setReasonPrompt({ action: 'reject', reason: '' })
                }
              >
                Reject
              </button>
              <button
                disabled={busy}
                className="rounded border border-amber-600 px-4 py-2 font-semibold text-amber-700 disabled:opacity-50"
                onClick={() =>
                  setReasonPrompt({ action: 'suspend', reason: '' })
                }
              >
                Suspend
              </button>
            </div>

            {reasonPrompt && (
              <div className="mt-4 rounded border p-4">
                <label className="block text-sm font-medium">
                  Reason
                  <textarea
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={reasonPrompt.reason}
                    onChange={(e) =>
                      setReasonPrompt((current) =>
                        current
                          ? {
                              ...current,
                              reason: (e.target as unknown as { value: string })
                                .value,
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <div className="mt-3 flex gap-3">
                  <button
                    disabled={busy || !reasonPrompt.reason.trim()}
                    className="rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
                    onClick={() =>
                      reasonPrompt.action === 'reject'
                        ? runAction('/reject', {
                            reason: reasonPrompt.reason,
                            canResubmit: true,
                          })
                        : runAction('/suspend', {
                            reason: 'manual',
                            note: reasonPrompt.reason,
                          })
                    }
                  >
                    Confirm {reasonPrompt.action}
                  </button>
                  <button
                    className="rounded border px-4 py-2 font-semibold"
                    onClick={() => setReasonPrompt(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
