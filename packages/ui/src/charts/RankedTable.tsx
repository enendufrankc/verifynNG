import * as React from 'react';
import { cn } from '@/lib/utils';

export interface RankedTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render?: (row: T) => React.ReactNode;
}

export interface RankedTableProps<T> {
  rows: T[];
  columns: RankedTableColumn<T>[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function RankedTable<T extends object>({
  rows,
  columns,
  rowKey,
  emptyMessage = 'No data for this range.',
}: RankedTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="text-fg-muted py-s8 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-surface-sunken">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-fg-muted px-s4 py-s2 text-xs font-medium tracking-wide uppercase',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-border border-t">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'text-fg px-s4 py-s2',
                    col.align === 'right'
                      ? 'text-right tabular-nums'
                      : 'text-left',
                  )}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
