'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, PageHeader, useToast } from '@verifyng/ui';
import { HistoryIcon } from 'lucide-react';
import Link from 'next/link';
import { ApiError } from '@/lib/api-client';
import {
  listProductPageVersions,
  rollbackProductPage,
} from '@/lib/product-pages';

export default function ProductPageHistoryRoute() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ['product-page-versions', id],
    queryFn: () => listProductPageVersions(id),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => rollbackProductPage(id, versionId),
    onSuccess: () => {
      toast({ title: 'Rolled back' });
      queryClient.invalidateQueries({
        queryKey: ['product-page-versions', id],
      });
      queryClient.invalidateQueries({ queryKey: ['product-page', id] });
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Rollback failed',
        variant: 'destructive',
      });
    },
  });

  const versions = versionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Version history" />
      <Link href={`/pages/${id}`} className="text-brand-text text-sm underline">
        Back to editor
      </Link>

      {versions.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No published versions yet" />
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center justify-between p-4"
            >
              <div>
                <p className="font-semibold">Version {version.version}</p>
                <p className="text-fg-muted text-sm">
                  {new Date(version.publishedAt).toLocaleString()}
                  {version.changeNote ? ` — ${version.changeNote}` : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={rollbackMutation.isPending}
                onClick={() => rollbackMutation.mutate(version.id)}
              >
                Restore this version
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
