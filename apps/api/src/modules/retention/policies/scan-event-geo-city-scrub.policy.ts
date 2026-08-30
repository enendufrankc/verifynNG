import { prisma } from '@verifynng/db';
import type { RetentionPolicy } from './policy.types';

const RETENTION_DAYS = 180;

/**
 * ScanEvent is append-only (E06 trigger + Prisma extension) — this is the
 * documented exception, lifting the trigger only for this scrub. Verdict,
 * tier, country and counts are anti-counterfeit evidence and are kept
 * indefinitely; only city-level location is scrubbed here.
 */
export const scanEventGeoCityScrubPolicy: RetentionPolicy = {
  name: 'scanEvent.geoCity.scrub',
  legalHoldAware: false,
  async run(dryRun: boolean) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const matched = await prisma.scanEvent.count({
      where: { geoCity: { not: null }, createdAt: { lt: cutoff } },
    });
    if (dryRun) return { matched, affected: 0, cutoff };

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ScanEvent" DISABLE TRIGGER "scan_event_no_update"',
    );
    try {
      const affected = await prisma.$executeRawUnsafe(
        'UPDATE "ScanEvent" SET "geoCity" = NULL WHERE "geoCity" IS NOT NULL AND "createdAt" < $1',
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
