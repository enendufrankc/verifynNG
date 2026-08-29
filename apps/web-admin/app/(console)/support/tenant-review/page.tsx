'use client';

import { useEffect, useState } from 'react';

interface ReviewTenant {
  id: string;
  name: string;
  country?: string;
  verificationDocuments?: unknown[];
}

export default function TenantReviewPage() {
  const [tenants, setTenants] = useState<ReviewTenant[]>([]);
  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/support/tenants?status=in_review`,
      { headers: { 'x-platform-role': 'support' } },
    )
      .then((r) => (r.ok ? (r.json() as Promise<ReviewTenant[]>) : []))
      .then(setTenants);
  }, []);
  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Tenant review</h1>
      <p className="mt-2 text-slate-600">
        Businesses waiting for identity verification.
      </p>
      <div className="mt-8 overflow-hidden rounded border">
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
              <tr key={tenant.id} className="border-t">
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
    </main>
  );
}
