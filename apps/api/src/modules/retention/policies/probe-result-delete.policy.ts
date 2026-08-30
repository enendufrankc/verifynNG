import { prisma } from '@verifynng/db';
import type { RetentionPolicy } from './policy.types';

const RETENTION_DAYS = 90;

export const probeResultDeletePolicy: RetentionPolicy = {
  name: 'probeResult.delete',
  legalHoldAware: false,
  async run(dryRun: boolean) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const where = { at: { lt: cutoff } };
    const matched = await prisma.probeResult.count({ where });
    if (dryRun) return { matched, affected: 0, cutoff };
    const result = await prisma.probeResult.deleteMany({ where });
    return { matched, affected: result.count, cutoff };
  },
};
