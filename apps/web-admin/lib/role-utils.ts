import { NAV, type NavEntry } from '@/app/(console)/nav.config';

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  operator: 2,
  owner: 3,
};

export function hasMinRole(
  userRole: string | null,
  minRole: string | undefined,
): boolean {
  if (!minRole) return true;
  if (!userRole) return false;
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

export function filterNavByRole(
  role: string | null,
  platformRole: string | null,
): NavEntry[] {
  return NAV.filter((entry) => {
    if (entry.section === 'platform' || entry.platformRole)
      return platformRole === entry.platformRole;
    return hasMinRole(role, entry.minRole);
  });
}
