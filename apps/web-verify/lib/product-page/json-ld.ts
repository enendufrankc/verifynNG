import type { Product, WithContext } from 'schema-dts';
import type { Block, Seo } from '@verifynng/page-schema';

export interface ProductJsonLdInput {
  tenantName: string;
  productSlug: string;
  seo: Seo;
  blocks: Block[];
  canonicalUrl: string;
}

/** T8/T13 — the `Product` JSON-LD embedded in a published page's `<head>`. */
export function buildProductJsonLd(
  input: ProductJsonLdInput,
): WithContext<Product> {
  const hero = input.blocks.find(
    (b): b is Extract<Block, { type: 'hero' }> => b.type === 'hero',
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.seo.title ?? input.productSlug,
    brand: { '@type': 'Brand', name: input.tenantName },
    description: input.seo.description,
    url: input.canonicalUrl,
    image: hero ? hero.image.variants.webp : [],
  };
}
