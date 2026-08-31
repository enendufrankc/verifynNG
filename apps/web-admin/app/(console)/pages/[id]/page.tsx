'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Skeleton, EmptyState } from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { getProductPage } from '@/lib/product-pages';
import { PageEditor } from '@/components/page-builder/PageEditor';

export default function ProductPageEditorRoute() {
  const { id } = useParams<{ id: string }>();

  const pageQuery = useQuery({
    queryKey: ['product-page', id],
    queryFn: () => getProductPage(id),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Edit page" description={pageQuery.data?.slug} />
      {pageQuery.isLoading && <Skeleton className="h-96 w-full" />}
      {pageQuery.isError && (
        <EmptyState icon={AlertTriangleIcon} title="Couldn't load this page" />
      )}
      {pageQuery.data && <PageEditor page={pageQuery.data} />}
    </div>
  );
}
