'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';

interface Incident {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'assessing' | 'contained' | 'notified' | 'closed';
  detectedAt: string;
  dataCategories: string[];
  affectedTenantIds: string[];
  ndpcNotifyRequired: boolean | null;
  ndpcNotifyDeadline: string | null;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Incident['severity']>('low');
  const [dataCategories, setDataCategories] = useState('');
  const [affectedTenantIds, setAffectedTenantIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setIncidents(await apiClient.get<Incident[]>('/v1/incidents'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async () => {
    setBusy(true);
    setMessage('');
    try {
      await apiClient.post('/v1/incidents', {
        title,
        severity,
        detectedAt: new Date().toISOString(),
        dataCategories: dataCategories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        affectedTenantIds: affectedTenantIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setTitle('');
      setDataCategories('');
      setAffectedTenantIds('');
      await load();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Failed to open incident.',
      );
    } finally {
      setBusy(false);
    }
  };

  const close = async (id: string) => {
    await apiClient.patch(`/v1/incidents/${id}`, { status: 'closed' });
    await load();
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Incident register</h1>
      <p className="mt-2 text-slate-600">
        The regulatory/legal record of data-exposure incidents — not the ops
        pager. See docs/runbooks/breach-notification.md.
      </p>

      <div className="mt-8 max-w-xl rounded border p-6">
        <h2 className="text-xl font-semibold">Open an incident</h2>
        <label className="mt-4 block text-sm font-medium">
          Title
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Severity
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={severity}
            onChange={(e) =>
              setSeverity(e.target.value as Incident['severity'])
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="mt-4 block text-sm font-medium">
          Data categories (comma-separated)
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="report.contactEmail, scan.ipHash"
            value={dataCategories}
            onChange={(e) => setDataCategories(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Affected tenant IDs (comma-separated)
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={affectedTenantIds}
            onChange={(e) => setAffectedTenantIds(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !title.trim()}
          onClick={open}
          className="mt-6 rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          Open incident
        </button>
        {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
      </div>

      <div className="mt-10 overflow-hidden rounded border">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Title</th>
              <th className="p-4">Severity</th>
              <th className="p-4">Status</th>
              <th className="p-4">NDPC deadline</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id} className="border-t">
                <td className="p-4">{incident.title}</td>
                <td className="p-4">{incident.severity}</td>
                <td className="p-4">{incident.status}</td>
                <td className="p-4">
                  {incident.ndpcNotifyDeadline
                    ? new Date(incident.ndpcNotifyDeadline).toLocaleString(
                        'en-GB',
                      )
                    : '—'}
                </td>
                <td className="p-4">
                  {incident.status !== 'closed' && (
                    <button
                      className="text-sm font-medium text-slate-700 underline"
                      onClick={() => close(incident.id)}
                    >
                      Close
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {incidents.length === 0 && (
          <p className="p-6 text-slate-500">No incidents recorded.</p>
        )}
      </div>
    </main>
  );
}
