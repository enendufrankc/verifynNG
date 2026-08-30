'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-store';
import { apiClient } from '@/lib/api-client';

interface PendingDoc {
  kind: 'privacy' | 'terms' | 'aup' | 'cookie' | 'subprocessors';
  version: string;
}

const TITLES: Record<PendingDoc['kind'], string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  aup: 'Acceptable Use Policy',
  cookie: 'Cookie Policy',
  subprocessors: 'Subprocessors',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Blocks the tenant console for `owner` until every pending legal document
 * is re-accepted; `operator`/`viewer` only see a banner (nothing else is
 * blocked). Consumer verification (`web-verify`) never depends on this.
 */
export function PolicyReacceptGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, isAuthenticated } = useAuth();
  const [pending, setPending] = useState<PendingDoc[] | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(() => {
    if (!isAuthenticated) {
      setChecked(true);
      return;
    }
    apiClient
      .get<PendingDoc[]>('/v1/legal/acceptance-status')
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setChecked(true));
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!checked || !pending || pending.length === 0) {
    return <>{children}</>;
  }

  if (role !== 'owner') {
    return (
      <div className="flex h-full flex-col">
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900"
        >
          Your account owner must accept updated terms before continuing.
        </div>
        {children}
      </div>
    );
  }

  return <ReacceptInterstitial pending={pending} onAccepted={refresh} />;
}

function ReacceptInterstitial({
  pending,
  onAccepted,
}: {
  pending: PendingDoc[];
  onAccepted: () => void;
}) {
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pending.forEach((doc) => {
      fetch(`${API_URL}/v1/legal/${doc.kind}`)
        .then((res) => res.json())
        .then((data: { bodyMd: string }) =>
          setBodies((prev) => ({ ...prev, [doc.kind]: data.bodyMd })),
        )
        .catch(() => {});
    });
  }, [pending]);

  const acceptAll = async () => {
    setBusy(true);
    try {
      for (const doc of pending) {
        await apiClient.post('/v1/legal/policies/accept', {
          kind: doc.kind,
          version: doc.version,
        });
      }
      onAccepted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-950/60 p-6">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded bg-white p-8">
        <h1 className="text-2xl font-semibold">Updated legal documents</h1>
        <p className="mt-2 text-slate-600">
          We&apos;ve updated the following. Please review and accept to
          continue.
        </p>
        <div className="mt-6 space-y-6">
          {pending.map((doc) => (
            <div key={doc.kind} className="rounded border p-4">
              <p className="font-semibold">
                {TITLES[doc.kind]} — version {doc.version}
              </p>
              <pre className="mt-3 max-h-48 overflow-y-auto text-sm whitespace-pre-wrap text-slate-700">
                {bodies[doc.kind] ?? 'Loading…'}
              </pre>
            </div>
          ))}
        </div>
        <button
          disabled={busy}
          onClick={acceptAll}
          className="mt-6 rounded bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
