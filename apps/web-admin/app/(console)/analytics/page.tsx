'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { KpiTile, PageHeader, StackedBars, RankedTable } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import {
  getBatches,
  getOverview,
  getVerdicts,
  type RangeKey,
  type BatchRow,
} from '@/lib/analytics';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  return (
    <div className="border-border inline-flex rounded-md border p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={
            r.key === value
              ? 'bg-brand text-brand-ink px-s3 py-s1 rounded text-sm font-medium'
              : 'text-fg-muted hover:text-fg px-s3 py-s1 rounded text-sm font-medium'
          }
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { activeTenantId } = useAuth();
  const [range, setRange] = useState<RangeKey>('30d');
  const tenantId = activeTenantId ?? '';

  const overviewQuery = useQuery({
    queryKey: queryKeys.analytics.overview(tenantId, range),
    queryFn: () => getOverview(range),
    enabled: !!tenantId,
  });
  const verdictsQuery = useQuery({
    queryKey: queryKeys.analytics.verdicts(tenantId, range),
    queryFn: () => getVerdicts(range),
    enabled: !!tenantId,
  });
  const batchesQuery = useQuery({
    queryKey: queryKeys.analytics.batches(tenantId, range),
    queryFn: () => getBatches(range, 'scans'),
    enabled: !!tenantId,
  });

  const overview = overviewQuery.data;
  const topBatches = (batchesQuery.data ?? []).slice(0, 10);

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Analytics"
        description="Scan volume, verdicts, and geography for this tenant — derived from daily rollups, never raw scan events."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="gap-s4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Scans"
          value={overview?.scans ?? '—'}
          delta={overview?.deltas.scans}
        />
        <KpiTile
          label="Tier-1 scans"
          value={overview?.tier1Scans ?? '—'}
          delta={overview?.deltas.tier1Scans}
        />
        <KpiTile
          label="Tier-2 verifies"
          value={overview?.tier2Verifies ?? '—'}
          delta={overview?.deltas.tier2Verifies}
        />
        <KpiTile
          label="Suspicious %"
          value={overview ? `${overview.suspiciousPct}%` : '—'}
          delta={overview?.deltas.suspiciousPct}
          invertDelta
        />
        <KpiTile
          label="Flagged units"
          value={overview?.flaggedUnits ?? '—'}
          delta={overview?.deltas.flaggedUnits}
          invertDelta
        />
        <KpiTile
          label="Countries"
          value={overview?.distinctCountries ?? '—'}
          delta={overview?.deltas.distinctCountries}
        />
      </div>

      <div className="bg-surface border-border p-s4 rounded-md border">
        <h2 className="text-fg mb-s3 text-sm font-semibold">
          Verdicts over time
        </h2>
        <StackedBars data={verdictsQuery.data ?? []} />
      </div>

      <div className="bg-surface border-border p-s4 rounded-md border">
        <h2 className="text-fg mb-s3 text-sm font-semibold">Top batches</h2>
        <RankedTable<BatchRow>
          rows={topBatches}
          rowKey={(row) => row.batchId}
          columns={[
            {
              key: 'batchId',
              label: 'Batch',
              render: (row) => (
                <Link
                  href={`/analytics/batches/${row.batchId}`}
                  className="text-brand-text hover:underline"
                >
                  {row.batchId}
                </Link>
              ),
            },
            { key: 'scans', label: 'Scans', align: 'right' },
            { key: 'tier2Verifies', label: 'Tier-2 verifies', align: 'right' },
            { key: 'suspicious', label: 'Suspicious', align: 'right' },
            { key: 'flagged', label: 'Flagged', align: 'right' },
            {
              key: 'topCountry',
              label: 'Top country',
              render: (row) => row.topCountry ?? '—',
            },
          ]}
        />
      </div>
    </div>
  );
}
