/**
 * E02 stub data — matches the published interface in docs/epics/E02-identity-access.md.
 * DELETE THIS FILE when E02 ships.
 */
export const STUB_USERS = {
  'owner@ivoryglow.local': {
    id: 'usr_ivory_owner',
    email: 'owner@ivoryglow.local',
    displayName: 'Ivory Owner',
    password: 'Passw0rd!Passw0rd!',
    platformRole: null as string | null,
    mfaEnabled: false,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'owner' as const },
    ],
  },
  'operator@ivoryglow.local': {
    id: 'usr_ivory_operator',
    email: 'operator@ivoryglow.local',
    displayName: 'Ivory Operator',
    password: 'Passw0rd!Passw0rd!',
    platformRole: null as string | null,
    mfaEnabled: false,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'operator' as const },
    ],
  },
  'viewer@ivoryglow.local': {
    id: 'usr_ivory_viewer',
    email: 'viewer@ivoryglow.local',
    displayName: 'Ivory Viewer',
    password: 'Passw0rd!Passw0rd!',
    platformRole: null as string | null,
    mfaEnabled: false,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'viewer' as const },
    ],
  },
  'support@verifyng.local': {
    id: 'usr_platform_support',
    email: 'support@verifyng.local',
    displayName: 'Platform Support',
    password: 'Passw0rd!Passw0rd!',
    platformRole: 'support' as const,
    mfaEnabled: false,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'viewer' as const },
    ],
  },
} as const;

export type StubUser = (typeof STUB_USERS)[keyof typeof STUB_USERS];

const sessions = new Map<string, { userId: string; refreshToken: string }>();
let sessionCounter = 0;

export function createStubSession(userId: string) {
  const sessionId = `sess_${++sessionCounter}`;
  const refreshToken = `rt_${sessionId}_${Date.now()}`;
  sessions.set(sessionId, { userId, refreshToken });
  return { accessToken: `stub_access_${sessionId}`, refreshToken, sessionId };
}

export function validateStubRefresh(refreshToken: string) {
  for (const [, session] of sessions) {
    if (session.refreshToken === refreshToken) {
      return { userId: session.userId, sessionId: '' };
    }
  }
  return null;
}

export function findUserByEmail(email: string): StubUser | undefined {
  return STUB_USERS[email as keyof typeof STUB_USERS];
}
