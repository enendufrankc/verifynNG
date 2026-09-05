import type { CSSProperties } from 'react';
import type { ThemeOverride } from '@verifynng/page-schema';
import type { TenantPublicProfile } from '@/lib/api';

/**
 * Same variable set as E09's `tenantThemeStyle`, but layers a page-level
 * `ThemeOverride` on top of the tenant's public-profile palette — a page can
 * theme itself distinctly from the tenant's default brand without touching
 * E03's data.
 */
export function pageThemeStyle(
  profile: Pick<TenantPublicProfile, 'palette' | 'fontDisplay' | 'fontBody'>,
  override: ThemeOverride,
): CSSProperties {
  const palette = { ...profile.palette, ...override.palette };
  const vars: Record<string, string> = {
    '--color-brand': palette.primary,
    '--color-brand-strong': palette.accent,
    '--color-brand-text': palette.primary,
    '--color-brand-ink': palette.ink,
    '--color-bg': palette.bg,
    '--color-fg': palette.ink,
  };
  const fontDisplay = override.fontDisplay ?? profile.fontDisplay;
  const fontBody = override.fontBody ?? profile.fontBody;
  if (fontDisplay) vars['--font-display'] = fontDisplay;
  if (fontBody) vars['--font-sans'] = fontBody;
  return vars as CSSProperties;
}
