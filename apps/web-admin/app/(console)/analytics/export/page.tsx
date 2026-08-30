'use client';

import { useState } from 'react';
import { Button, PageHeader, useToast } from '@verifyng/ui';
import { DownloadIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { downloadExport, type RangeKey } from '@/lib/analytics';

const RANGES: RangeKey[] = ['7d', '30d', '90d'];
const DIMENSIONS = [
  { key: 'batch', label: 'By batch' },
  { key: 'product', label: 'By product' },
  { key: 'geo', label: 'By geography' },
  { key: 'verdict', label: 'By verdict' },
] as const;

export default function AnalyticsExportPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [range, setRange] = useState<RangeKey>('30d');
  const [dimension, setDimension] =
    useState<(typeof DIMENSIONS)[number]['key']>('batch');
  const [downloading, setDownloading] = useState(false);

  // export.csv is `operator`+ on the API; a viewer never sees the button.
  const canExport = role === 'operator' || role === 'owner';

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadExport(range, dimension);
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not download the CSV. Try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Export"
        description="Download analytics as CSV for a date range and dimension."
      />

      <div className="bg-surface border-border space-y-s4 p-s5 max-w-md rounded-md border">
        <div>
          <label className="text-fg-muted mb-s2 block text-xs font-medium tracking-wide uppercase">
            Range
          </label>
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

        <div>
          <label className="text-fg-muted mb-s2 block text-xs font-medium tracking-wide uppercase">
            Dimension
          </label>
          <div className="border-border inline-flex flex-wrap rounded-md border p-0.5">
            {DIMENSIONS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDimension(d.key)}
                className={
                  d.key === dimension
                    ? 'bg-brand text-brand-ink px-s3 py-s1 rounded text-sm font-medium'
                    : 'text-fg-muted hover:text-fg px-s3 py-s1 rounded text-sm font-medium'
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {canExport ? (
          <Button onClick={handleDownload} disabled={downloading}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            {downloading ? 'Downloading…' : 'Download CSV'}
          </Button>
        ) : (
          <p className="text-fg-muted text-sm">
            Exporting requires the operator or owner role.
          </p>
        )}
      </div>
    </div>
  );
}
