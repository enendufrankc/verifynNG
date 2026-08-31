import { loadEnv } from '@verifynng/config';
import { getSitemapEntries } from '@/lib/product-page/page-fetcher';

export const revalidate = 300;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const entries = await getSitemapEntries(tenantSlug);
  const baseUrl = loadEnv().PAGES_PUBLIC_BASE_URL;

  const urls = entries
    .map((entry) => {
      const loc = escapeXml(`${baseUrl}/p/${tenantSlug}/${entry.slug}`);
      const lastmod = entry.lastmod
        ? `<lastmod>${entry.lastmod}</lastmod>`
        : '';
      return `<url><loc>${loc}</loc>${lastmod}</url>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
