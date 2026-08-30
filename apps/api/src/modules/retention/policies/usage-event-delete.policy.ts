import type { RetentionPolicy } from './policy.types';

/**
 * Pending E12 (Analytics & Usage Metering) — there is no `UsageEvent` model
 * on `main` yet. Registered as a no-op for the same reason as
 * report.photos.delete (see that file).
 */
export const usageEventDeletePolicy: RetentionPolicy = {
  name: 'usageEvent.delete',
  legalHoldAware: false,
  async run(_dryRun: boolean) {
    return { matched: 0, affected: 0, cutoff: new Date() };
  },
};
