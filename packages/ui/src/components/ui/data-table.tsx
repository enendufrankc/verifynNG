'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type HeaderContext,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { EmptyState } from './empty-state';
import { cn } from '@/lib/utils';
import { ListIcon } from 'lucide-react';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: {
    hasNext: boolean;
    hasPrev: boolean;
    onNext: () => void;
    onPrev: () => void;
    cursor?: string | null;
  };
  rowActions?: (row: TData) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  sorting,
  onSortingChange,
  pagination,
  rowActions,
  emptyState,
  className,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>(
    [],
  );
  const currentSorting = sorting ?? internalSorting;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updaterOrValue) => {
      const next =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(currentSorting)
          : updaterOrValue;
      if (onSortingChange) {
        onSortingChange(next);
      } else {
        setInternalSorting(next);
      }
    },
    state: { sorting: currentSorting },
  });

  if (!isLoading && data.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? (
          <EmptyState
            icon={ListIcon}
            title="No data"
            description="No items to display."
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="border-border hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="bg-surface sticky top-0"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
                {rowActions && (
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_, j) => (
                      <TableCell key={j}>
                        <div className="bg-surface-sunken h-4 w-24 animate-pulse rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell>{rowActions(row.original)}</TableCell>
                    )}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 md:hidden">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="border-border space-y-2 rounded-md border p-4"
              >
                {columns.slice(0, 3).map((_, j) => (
                  <div
                    key={j}
                    className="bg-surface-sunken h-4 w-full animate-pulse rounded"
                  />
                ))}
              </div>
            ))
          : table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="border-border bg-surface space-y-2 rounded-md border p-4"
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="flex justify-between text-sm">
                    <span className="text-fg-muted">
                      {flexRender(
                        cell.column.columnDef.header,
                        cell.getContext() as unknown as HeaderContext<
                          TData,
                          TValue
                        >,
                      )}
                    </span>
                    <span>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </span>
                  </div>
                ))}
                {rowActions && (
                  <div className="pt-2">{rowActions(row.original)}</div>
                )}
              </div>
            ))}
      </div>
      {pagination && (pagination.hasPrev || pagination.hasNext) && (
        <div className="flex items-center justify-between">
          <button
            onClick={pagination.onPrev}
            disabled={!pagination.hasPrev}
            className="text-fg-muted hover:text-fg text-sm disabled:opacity-50"
          >
            ← Previous
          </button>
          <button
            onClick={pagination.onNext}
            disabled={!pagination.hasNext}
            className="text-fg-muted hover:text-fg text-sm disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
