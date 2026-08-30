import { prisma } from '@verifynng/db';
import type { RetentionPolicy } from './policy.types';
import type { DsarStorageService } from '../../dsar/dsar-storage.service';

export function createDsarExportDeletePolicy(
  storage: DsarStorageService,
): RetentionPolicy {
  return {
    name: 'dsarExport.delete',
    legalHoldAware: false,
    async run(dryRun: boolean) {
      const cutoff = new Date();
      const where = {
        exportExpiresAt: { lt: cutoff },
        exportObjectKey: { not: null },
      };
      const expired = await prisma.dsarRequest.findMany({
        where,
        select: { id: true, exportObjectKey: true },
      });
      if (dryRun) {
        return { matched: expired.length, affected: 0, cutoff };
      }
      let affected = 0;
      for (const row of expired) {
        if (row.exportObjectKey) {
          await storage.delete(row.exportObjectKey).catch(() => undefined);
        }
        await prisma.dsarRequest.update({
          where: { id: row.id },
          data: { exportObjectKey: null },
        });
        affected += 1;
      }
      return { matched: expired.length, affected, cutoff };
    },
  };
}
