import type { ReactNode } from 'react';
import { tenantThemeStyle } from '@/lib/theme';
import type { TenantPublicProfile } from '@/lib/api';

/**
 * Sets the tenant's brand/bg/fg CSS variables for everything inside it.
 * `display: contents` keeps it out of the box model — only the CSS custom
 * properties cascade to descendants. Any route in this app (E09's own, or
 * E10/E17/E19's carve-outs) wraps its content in this once it has resolved
 * a `TenantPublicProfile` (via `getTenantPublicProfile` in lib/api.ts).
 */
export function TenantThemeProvider({
  profile,
  children,
}: {
  profile: TenantPublicProfile;
  children: ReactNode;
}) {
  return (
    <div className="contents" style={tenantThemeStyle(profile)}>
      {children}
    </div>
  );
}
