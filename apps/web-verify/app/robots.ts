import type { MetadataRoute } from 'next';

/** `/v/**` carries per-unit codes in the path — never let a crawler index or cache one (T7). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: ['/v/'] },
  };
}
