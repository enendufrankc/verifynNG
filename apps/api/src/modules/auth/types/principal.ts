export interface UserPrincipal {
  userId: string;
  tenantId: string;
  role: string;
  platformRole?: string;
  sessionId: string;
}

export interface ApiClientPrincipal {
  apiClientId: string;
  tenantId: string | null;
  scopes: string[];
}

export type Principal = UserPrincipal | ApiClientPrincipal;

export function isApiClientPrincipal(
  principal: Principal,
): principal is ApiClientPrincipal {
  return 'apiClientId' in principal;
}
