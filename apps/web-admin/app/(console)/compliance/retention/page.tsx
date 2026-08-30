'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';

interface Policy {
  name: string;
  legalHoldAware: boolean;
}

interface RetentionRun {
  id: string;
  policy: string;
  dryRun: boolean;
  matched: number;
  affected: number;
  startedAt: string;
  error: string | null;
}

export default function RetentionPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [runs, setRuns] = useState<RetentionRun[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      apiClient.get<Policy[]>('/v1/retention/policies'),
      apiClient.get<RetentionRun[]>('/v1/retention/runs'),
    ]);
    setPolicies(p);
    setRuns(r);
    setSelected((current) => current || p[0]?.name || '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      await apiClient.post('/v1/retention/run', { dryRun, policy: selected });
      setMessage(`${dryRun ? 'Dry run' : 'Wet run'} of ${selected} complete.`);
      await load();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Run failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Retention</h1>
      <p className="mt-2 text-slate-600">
        A wet run always requires a dry run for that policy within the last 24
        hours. See docs/compliance/retention-schedule.md.
      </p>

      <div className="mt-8 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Policy
          <select
            className="mt-1 block rounded border px-3 py-2"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {policies.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !selected}
          onClick={() => run(true)}
          className="rounded border border-slate-950 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
        >
          Dry run
        </button>
        <button
          disabled={busy || !selected}
          onClick={() => run(false)}
          className="rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          Wet run
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}

      <div className="mt-10 overflow-hidden rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Policy</th>
              <th className="p-4">Mode</th>
              <th className="p-4">Matched</th>
              <th className="p-4">Affected</th>
              <th className="p-4">Started</th>
              <th className="p-4">Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-4">{r.policy}</td>
                <td className="p-4">{r.dryRun ? 'dry' : 'wet'}</td>
                <td className="p-4">{r.matched}</td>
                <td className="p-4">{r.affected}</td>
                <td className="p-4">
                  {new Date(r.startedAt).toLocaleString('en-GB')}
                </td>
                <td className="p-4 text-red-700">{r.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && (
          <p className="p-6 text-slate-500">No retention runs yet.</p>
        )}
      </div>
    </main>
  );
}
