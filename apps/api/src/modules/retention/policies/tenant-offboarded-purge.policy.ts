import { prisma } from '@verifynng/db';
import type { RetentionPolicy } from './policy.types';
import type { TenantOffboardingProcessor } from '../../../jobs/tenant-offboarding.processor';

const GRACE_DAYS = 30;

/**
 * Extends E03's TenantOffboardingProcessor.runDelete() (products, batches,
 * units, scan events, tenant storage prefix) with the User/Session/
 * Membership purge that processor doesn't do — see
 * docs/superpowers/plans/2026-08-30-e19-legal-documents-milestone1.md for
 * why this lives here rather than in tenant-offboarding.processor.ts.
 */
export function createTenantOffboardedPurgePolicy(
  processor: TenantOffboardingProcessor,
): RetentionPolicy {
  return {
    name: 'tenant.offboarded.purge',
    legalHoldAware: true,
    async run(dryRun: boolean) {
      const cutoff = new Date(Date.now() - GRACE_DAYS * 86_400_000);
      const candidates = await prisma.tenant.findMany({
        where: { status: 'offboarded', offboardedAt: { lt: cutoff } },
        select: { id: true },
      });
      const eligible: string[] = [];
      for (const tenant of candidates) {
        const held = await prisma.legalHold.findFirst({
          where: { scope: 'tenant', ref: tenant.id, releasedAt: null },
        });
        if (!held) eligible.push(tenant.id);
      }
      if (dryRun) return { matched: eligible.length, affected: 0, cutoff };

      let affected = 0;
      for (const tenantId of eligible) {
        await processor.runDelete(tenantId);
        await purgeUsersAndSessions(tenantId);
        affected += 1;
      }
      return { matched: eligible.length, affected, cutoff };
    },
  };
}

async function purgeUsersAndSessions(tenantId: string): Promise<void> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    select: { userId: true },
  });
  await prisma.membership.deleteMany({ where: { tenantId } });
  await prisma.session.deleteMany({ where: { tenantId } });
  for (const { userId } of memberships) {
    const remaining = await prisma.membership.count({ where: { userId } });
    if (remaining === 0) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user
        .delete({ where: { id: userId } })
        .catch(() => undefined);
    }
  }
}
