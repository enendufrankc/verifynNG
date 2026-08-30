import { prisma } from '@verifynng/db';
import type { RetentionPolicy } from './policy.types';

const RETENTION_DAYS = 180;

export const scanEventUserAgentScrubPolicy: RetentionPolicy = {
  name: 'scanEvent.userAgent.scrub',
  legalHoldAware: false,
  async run(dryRun: boolean) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const matched = await prisma.scanEvent.count({
      where: { userAgent: { not: null }, createdAt: { lt: cutoff } },
    });
    if (dryRun) return { matched, affected: 0, cutoff };

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ScanEvent" DISABLE TRIGGER "scan_event_no_update"',
    );
    try {
      const affected = await prisma.$executeRawUnsafe(
        'UPDATE "ScanEvent" SET "userAgent" = NULL WHERE "userAgent" IS NOT NULL AND "createdAt" < $1',
        cutoff,
      );
      return { matched, affected: Number(affected), cutoff };
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "ScanEvent" ENABLE TRIGGER "scan_event_no_update"',
      );
    }
  },
};
