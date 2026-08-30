import { prisma } from '@verifynng/db';
import type { RetentionPolicy } from './policy.types';
import type { Prisma } from '@prisma/client';

const RETENTION_DAYS = 30;

/** Never deletes an active session — only ones already expired or revoked. */
export const sessionDeletePolicy: RetentionPolicy = {
  name: 'session.delete',
  legalHoldAware: false,
  async run(dryRun: boolean) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const where: Prisma.SessionWhereInput = {
      createdAt: { lt: cutoff },
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    };
    const matched = await prisma.session.count({ where });
    if (dryRun) return { matched, affected: 0, cutoff };
    const result = await prisma.session.deleteMany({ where });
    return { matched, affected: result.count, cutoff };
  },
};
