'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, StackedBars, GeoTable } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { getGeo, getVerdicts, type RangeKey } from '@/lib/analytics';

const RANGES: RangeKey[] = ['7d', '30d', '90d'];

export default function ProductAnalyticsPage() {
  const { productId } = useParams<{ productId: string }>();
  const { activeTenantId } = useAuth();
  const [range, setRange] = useState<RangeKey>('30d');
  const tenantId = activeTenantId ?? '';

  const verdictsQuery = useQuery({
    queryKey: ['analytics', 'product-verdicts', tenantId, productId, range],
    queryFn: () => getVerdicts(range, { productId }),
    enabled: !!tenantId,
  });
  const geoQuery = useQuery({
    queryKey: ['analytics', 'product-geo', tenantId, productId, range],
    queryFn: () => getGeo(range, 'country', { productId }),
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-s6">
      <PageHeader
        title={`Product ${productId}`}
        description="Scan activity for this product."
        actions={
          <div className="border-border inline-flex rounded-md border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={
                  r === range
                    ? 'bg-brand text-brand-ink px-s3 py-s1 rounded text-sm font-medium'
                    : 'text-fg-muted hover:text-fg px-s3 py-s1 rounded text-sm font-medium'
                }
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      <div className="bg-surface border-border p-s4 rounded-md border">
        <h2 className="text-fg mb-s3 text-sm font-semibold">
          Verdicts over time
        </h2>
        <StackedBars data={verdictsQuery.data ?? []} />
      </div>

      <div className="bg-surface border-border p-s4 rounded-md border">
        <h2 className="text-fg mb-s3 text-sm font-semibold">Geography</h2>
        <GeoTable rows={geoQuery.data ?? []} />
      </div>
    </div>
  );
}
