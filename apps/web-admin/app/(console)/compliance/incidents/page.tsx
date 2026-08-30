'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  detectedAt: string;
}

export default function TenantIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    apiClient
      .get<Incident[]>('/v1/incidents/mine')
      .then(setIncidents)
      .catch(() => setIncidents([]));
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Incidents</h1>
      <p className="mt-2 text-slate-600">
        Incidents naming your organisation. Read-only — the platform's support
        team manages these.
      </p>
      <div className="mt-8 overflow-hidden rounded border">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Title</th>
              <th className="p-4">Severity</th>
              <th className="p-4">Status</th>
              <th className="p-4">Detected</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id} className="border-t">
                <td className="p-4">{incident.title}</td>
                <td className="p-4">{incident.severity}</td>
                <td className="p-4">{incident.status}</td>
                <td className="p-4">
                  {new Date(incident.detectedAt).toLocaleDateString('en-GB')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {incidents.length === 0 && (
          <p className="p-6 text-slate-500">
            No incidents name your organisation.
          </p>
        )}
      </div>
    </main>
  );
}
