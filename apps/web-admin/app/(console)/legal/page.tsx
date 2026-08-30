'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface Acceptance {
  kind: string;
  version: string;
  acceptedAt: string;
  userId: string;
}

export default function YourAgreementsPage() {
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);

  useEffect(() => {
    apiClient
      .get<Acceptance[]>('/v1/legal/agreements')
      .then(setAcceptances)
      .catch(() => setAcceptances([]));
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Your agreements</h1>
      <p className="mt-2 text-slate-600">
        Legal documents your organisation has accepted.
      </p>
      <div className="mt-8 overflow-hidden rounded border">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Document</th>
              <th className="p-4">Version</th>
              <th className="p-4">Accepted</th>
            </tr>
          </thead>
          <tbody>
            {acceptances.map((a) => (
              <tr
                key={`${a.kind}-${a.version}-${a.userId}`}
                className="border-t"
              >
                <td className="p-4">{a.kind}</td>
                <td className="p-4">{a.version}</td>
                <td className="p-4">
                  {new Date(a.acceptedAt).toLocaleDateString('en-GB')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {acceptances.length === 0 && (
          <p className="p-6 text-slate-500">No acceptance history yet.</p>
        )}
      </div>
    </main>
  );
}
