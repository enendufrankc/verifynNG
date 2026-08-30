'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { verdictColor } from './tokens';

export interface VerdictSeriesPoint {
  date: string;
  verdict: string;
  count: number;
}

export interface StackedBarsProps {
  data: VerdictSeriesPoint[];
  height?: number;
}

/** Pivots [{date, verdict, count}] rows into one row per date with a column per verdict. */
function pivot(data: VerdictSeriesPoint[]): {
  rows: Array<Record<string, string | number>>;
  verdicts: string[];
} {
  const verdictSet = new Set<string>();
  const byDate = new Map<string, Record<string, string | number>>();
  for (const point of data) {
    verdictSet.add(point.verdict);
    const row = byDate.get(point.date) ?? { date: point.date };
    row[point.verdict] = point.count;
    byDate.set(point.date, row);
  }
  return {
    rows: [...byDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    ),
    verdicts: [...verdictSet].sort(),
  };
}

export function StackedBars({ data, height = 280 }: StackedBarsProps) {
  const { rows, verdicts } = React.useMemo(() => pivot(data), [data]);

  if (rows.length === 0) {
    return (
      <div
        className="text-fg-muted flex h-[280px] items-center justify-center text-sm"
        style={{ height }}
      >
        No scans in this range.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--color-fg-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--color-fg-muted)' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {verdicts.map((verdict) => (
          <Bar
            key={verdict}
            dataKey={verdict}
            stackId="verdicts"
            fill={verdictColor(verdict)}
            radius={[0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
