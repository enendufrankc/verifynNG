import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDocPage, listSlugs } from '@/lib/content';

export function generateStaticParams() {
  return listSlugs().map((slug) => ({ slug: slug.split('/') }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocPage(slug.join('/'));
  return { title: page?.title ?? 'Not found' };
}

export default async function DocContentPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const page = getDocPage(slug.join('/'));
  if (!page) notFound();

  return (
    <article
      className="prose"
      // Content is our own committed markdown (apps/docs/content/**), never
      // user input — see lib/content.ts.
      dangerouslySetInnerHTML={{ __html: page.html }}
    />
  );
}
