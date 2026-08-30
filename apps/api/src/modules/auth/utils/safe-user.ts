import type { User } from '@prisma/client';

export interface SafeUser {
  id: string;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
  platformRole: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Strips password hash, MFA secret, and recovery codes before returning a user to a client. */
export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    mfaEnabled: user.mfaEnabled,
    platformRole: user.platformRole,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
