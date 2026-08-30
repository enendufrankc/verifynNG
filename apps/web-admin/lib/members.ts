import { apiClient } from './api-client';

export type MemberRole = 'owner' | 'operator' | 'viewer';

export interface TenantMember {
  userId: string;
  email: string;
  displayName: string;
  role: MemberRole;
  joinedAt: string;
}

export function listMembers(tenantPath: (path: string) => string) {
  return apiClient.get<TenantMember[]>(tenantPath('/members'));
}

export function inviteMember(
  tenantPath: (path: string) => string,
  input: { email: string; role: MemberRole },
) {
  return apiClient.post<TenantMember>(tenantPath('/members'), input);
}

export function updateMemberRole(
  tenantPath: (path: string) => string,
  userId: string,
  role: MemberRole,
) {
  return apiClient.patch<TenantMember>(tenantPath(`/members/${userId}`), {
    role,
  });
}

export function removeMember(
  tenantPath: (path: string) => string,
  userId: string,
) {
  return apiClient.delete<void>(tenantPath(`/members/${userId}`));
}
