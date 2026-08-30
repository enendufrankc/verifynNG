import type { CSSProperties } from 'react';
import type { TenantPublicProfile } from './api';

/**
 * Maps a tenant's public-profile palette onto packages/ui's brand/bg/fg CSS
 * custom properties (packages/ui/src/tokens.css) — never the verdict
 * tokens, which are fixed per docs/design/README.md regardless of tenant.
 * Rendered as inline `style` so theming works with JavaScript disabled.
 */
export function tenantThemeStyle(
  profile: Pick<TenantPublicProfile, 'palette' | 'fontDisplay'>,
): CSSProperties {
  const vars: Record<string, string> = {
    '--color-brand': profile.palette.primary,
    '--color-brand-strong': profile.palette.accent,
    '--color-brand-text': profile.palette.primary,
    '--color-brand-ink': profile.palette.ink,
    '--color-bg': profile.palette.bg,
    '--color-fg': profile.palette.ink,
  };
  if (profile.fontDisplay) vars['--font-sans'] = profile.fontDisplay;
  return vars as CSSProperties;
}
