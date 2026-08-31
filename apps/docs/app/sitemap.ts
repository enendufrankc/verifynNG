import type { MetadataRoute } from 'next';
import { listSlugs } from '@/lib/content';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:3002';
  const staticRoutes = ['', '/docs', '/docs/api'];
  const docRoutes = listSlugs().map((slug) => `/docs/${slug}`);
  return [...staticRoutes, ...docRoutes].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
}
