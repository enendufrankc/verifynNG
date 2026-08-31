import type { ComponentType } from 'react';
import type { Locale } from '@/lib/i18n';
// E10's one-line registration (see AGENTS.md / docs/epics/E10-product-pages.md).
import { ProductPageTier1Renderer } from '@/components/product-page/ProductPageTier1Renderer';

export interface Tier1ProductSlotProps {
  tenantSlug: string;
  productId?: string;
  batchId?: string;
  productName?: string;
  oemName?: string;
  commissionedAt?: string;
  locale: Locale;
}

let renderer: ComponentType<Tier1ProductSlotProps> | null = null;

/**
 * E10's registration point for the tier-1 product slot boundary
 * (`<Tier1ProductSlot>` in components/verdict/Tier1ProductSlot.tsx). E10
 * calls this once from its own module init; E09's default renders until it
 * does. This is the *only* file outside its own paths E10 may call into.
 */
export function registerTier1Renderer(
  component: ComponentType<Tier1ProductSlotProps>,
): void {
  renderer = component;
}

export function getTier1Renderer(): ComponentType<Tier1ProductSlotProps> | null {
  return renderer;
}

registerTier1Renderer(ProductPageTier1Renderer);
