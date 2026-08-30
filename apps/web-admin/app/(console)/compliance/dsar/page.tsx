'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';

interface DsarRequest {
  id: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
}

export default function TenantDsarPage() {
  const [requests, setRequests] = useState<DsarRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setRequests(await apiClient.get<DsarRequest[]>('/v1/dsar/tenant'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestExport = async () => {
    setBusy(true);
    setMessage('');
    try {
      await apiClient.post('/v1/dsar/tenant', { action: 'export' });
      setMessage(
        "Export requested — you'll receive an email with a download link once it's ready.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Data export</h1>
      <p className="mt-2 text-slate-600">
        Export everything the platform holds about your organisation — catalog
        data, consents, agreements, and incidents naming you. To delete your
        organisation's data, use{' '}
        <a href="/settings/organization" className="underline">
          offboarding
        </a>{' '}
        instead.
      </p>
      <button
        disabled={busy}
        onClick={requestExport}
        className="mt-6 rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        Request export
      </button>
      {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}

      <div className="mt-10 overflow-hidden rounded border">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Requested</th>
              <th className="p-4">Status</th>
              <th className="p-4">Completed</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-4">
                  {new Date(r.requestedAt).toLocaleString('en-GB')}
                </td>
                <td className="p-4">{r.status}</td>
                <td className="p-4">
                  {r.completedAt
                    ? new Date(r.completedAt).toLocaleString('en-GB')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 && (
          <p className="p-6 text-slate-500">No export requests yet.</p>
        )}
      </div>
    </main>
  );
}
