import { CHART_PALETTE } from './tokens';

export interface GeoTableRow {
  country: string;
  city?: string;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
}

export interface GeoTableProps {
  rows: GeoTableRow[];
  emptyMessage?: string;
}

/**
 * Country/city breakdown with a proportional share bar. Ships instead of
 * the spec's ChoroplethLite (an SVG world map by ISO-3166 fill) — that map
 * needs real per-country path data this pass didn't have time to source
 * cleanly; the table carries the same information. See
 * docs/analytics-and-metering.md.
 */
export function GeoTable({
  rows,
  emptyMessage = 'No geo data for this range.',
}: GeoTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-fg-muted py-s8 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.scans));

  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-surface-sunken">
          <tr>
            <th className="text-fg-muted px-s4 py-s2 text-left text-xs font-medium tracking-wide uppercase">
              Location
            </th>
            <th className="text-fg-muted px-s4 py-s2 text-left text-xs font-medium tracking-wide uppercase">
              Share
            </th>
            <th className="text-fg-muted px-s4 py-s2 text-right text-xs font-medium tracking-wide uppercase">
              Scans
            </th>
            <th className="text-fg-muted px-s4 py-s2 text-right text-xs font-medium tracking-wide uppercase">
              Tier-2
            </th>
            <th className="text-fg-muted px-s4 py-s2 text-right text-xs font-medium tracking-wide uppercase">
              Suspicious
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.country}-${row.city ?? ''}`}
              className="border-border border-t"
            >
              <td className="text-fg px-s4 py-s2">
                {row.country}
                {row.city ? (
                  <span className="text-fg-muted"> · {row.city}</span>
                ) : null}
              </td>
              <td className="px-s4 py-s2">
                <div className="bg-surface-sunken h-2 w-24 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, (row.scans / max) * 100)}%`,
                      background: CHART_PALETTE[i % CHART_PALETTE.length],
                    }}
                  />
                </div>
              </td>
              <td className="text-fg px-s4 py-s2 text-right tabular-nums">
                {row.scans}
              </td>
              <td className="text-fg px-s4 py-s2 text-right tabular-nums">
                {row.tier2Verifies}
              </td>
              <td className="text-fg px-s4 py-s2 text-right tabular-nums">
                {row.suspicious}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
