'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, HelpLink, Input, PageHeader } from '@verifyng/ui';

// Scan events are append-only and read through two lenses: per unit (the
// unit page's scan history) and aggregated (Analytics). There is no raw
// tenant-wide scan feed by design — verdicts are derived from history, not
// browsed as a list (mental model §4).
export default function ScansPage() {
  const router = useRouter();
  const [unitId, setUnitId] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scans"
        description="Every verification is recorded as an append-only scan event. Browse them per unit, or see volumes, verdicts and geography under Analytics."
        actions={<HelpLink docSlug="console/scans" module="scans" />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border-border space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Scan history for one unit</h2>
          <p className="text-fg-muted text-sm">
            Paste a unit id, or open a unit from a batch or an anomaly.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (unitId.trim()) router.push(`/units/${unitId.trim()}`);
            }}
          >
            <Input
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              placeholder="Unit id"
            />
            <Button type="submit">Open</Button>
          </form>
        </div>

        <div className="border-border space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Aggregates</h2>
          <p className="text-fg-muted text-sm">
            Scan volume, verdict mix, top batches and countries — computed
            from daily rollups.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/analytics">Analytics overview</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/analytics/geo">Geography</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
