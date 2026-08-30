'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, GeoTable } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { getGeo, type RangeKey } from '@/lib/analytics';

const RANGES: RangeKey[] = ['7d', '30d', '90d'];

export default function GeoAnalyticsPage() {
  const { activeTenantId } = useAuth();
  const [range, setRange] = useState<RangeKey>('30d');
  const [groupBy, setGroupBy] = useState<'country' | 'city'>('country');
  const tenantId = activeTenantId ?? '';

  const geoQuery = useQuery({
    queryKey: queryKeys.analytics.geo(tenantId, range, groupBy),
    queryFn: () => getGeo(range, groupBy),
    enabled: !!tenantId,
  });

  const rows = geoQuery.data ?? [];
  const suspiciousTotal = rows.reduce((sum, r) => sum + r.suspicious, 0);

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Geography"
        description="Where scans for this tenant are coming from."
        actions={
          <div className="gap-s3 flex items-center">
            <div className="border-border inline-flex rounded-md border p-0.5">
              {(['country', 'city'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={
                    g === groupBy
                      ? 'bg-brand text-brand-ink px-s3 py-s1 rounded text-sm font-medium capitalize'
                      : 'text-fg-muted hover:text-fg px-s3 py-s1 rounded text-sm font-medium capitalize'
                  }
                >
                  {g}
                </button>
              ))}
            </div>
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
          </div>
        }
      />

      <div className="bg-surface border-border p-s4 rounded-md border">
        <div className="text-fg-muted mb-s3 text-sm">
          {rows.length} {groupBy === 'city' ? 'cities' : 'countries'} ·{' '}
          {suspiciousTotal} suspicious scans in range
        </div>
        <GeoTable
          rows={rows}
          emptyMessage={
            groupBy === 'city'
              ? 'No city-level data — E06 only recorded country for these scans.'
              : 'No geo data for this range.'
          }
        />
      </div>
    </div>
  );
}
