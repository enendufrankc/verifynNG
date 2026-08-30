'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';

const KINDS = ['privacy', 'terms', 'aup', 'cookie', 'subprocessors'] as const;
type Kind = (typeof KINDS)[number];

const TITLES: Record<Kind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  aup: 'Acceptable Use Policy',
  cookie: 'Cookie Policy',
  subprocessors: 'Subprocessors',
};

interface LegalDocument {
  kind: Kind;
  version: string;
  locale: string;
  bodyMd: string;
  changeSummary: string | null;
  requiresReacceptance: boolean;
  publishedAt: string;
}

export default function LegalDocsPage() {
  const [current, setCurrent] = useState<Partial<Record<Kind, LegalDocument>>>(
    {},
  );
  const [selected, setSelected] = useState<Kind>('privacy');
  const [version, setVersion] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [requiresReacceptance, setRequiresReacceptance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadCurrent = useCallback(async () => {
    const results = await Promise.all(
      KINDS.map(async (kind) => {
        try {
          return [
            kind,
            await apiClient.get<LegalDocument>(`/v1/legal/${kind}`),
          ] as const;
        } catch {
          return [kind, undefined] as const;
        }
      }),
    );
    setCurrent(Object.fromEntries(results.filter(([, doc]) => doc)));
  }, []);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  const publish = async () => {
    setBusy(true);
    setMessage('');
    try {
      await apiClient.post(`/v1/legal/${selected}/versions`, {
        version,
        bodyMd,
        changeSummary: changeSummary || undefined,
        requiresReacceptance,
      });
      setMessage(`Published ${TITLES[selected]} v${version}.`);
      setVersion('');
      setBodyMd('');
      setChangeSummary('');
      setRequiresReacceptance(false);
      await loadCurrent();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Failed to publish.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Legal documents</h1>
      <p className="mt-2 text-slate-600">
        Publish new versions of the platform&apos;s legal documents. Publishing
        with &quot;requires re-acceptance&quot; blocks tenant console writes for
        owners until they accept.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map((kind) => {
          const doc = current[kind];
          return (
            <div key={kind} className="rounded border p-4">
              <p className="font-semibold">{TITLES[kind]}</p>
              <p className="mt-1 text-sm text-slate-500">
                {doc
                  ? `v${doc.version} — ${new Date(doc.publishedAt).toLocaleDateString('en-GB')}`
                  : 'Not published yet'}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-10 max-w-2xl rounded border p-6">
        <h2 className="text-xl font-semibold">Publish a new version</h2>
        <label className="mt-4 block text-sm font-medium">
          Document
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={selected}
            onChange={(e) => setSelected(e.target.value as Kind)}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {TITLES[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-sm font-medium">
          Version
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="e.g. 2026-09-15"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Change summary
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Body (Markdown)
          <textarea
            className="mt-1 h-64 w-full rounded border px-3 py-2 font-mono text-sm"
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
          />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={requiresReacceptance}
            onChange={(e) => setRequiresReacceptance(e.target.checked)}
          />
          Requires re-acceptance
        </label>
        <button
          disabled={busy || !version.trim() || !bodyMd.trim()}
          className="mt-6 rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
          onClick={publish}
        >
          Publish
        </button>
        {message && (
          <p role="status" className="mt-4 text-sm text-slate-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
