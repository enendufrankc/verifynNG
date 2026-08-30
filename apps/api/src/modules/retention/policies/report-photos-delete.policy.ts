import type { RetentionPolicy } from './policy.types';

/**
 * Pending E08 (Consumer Reporting) — there is no `Report` model on `main`
 * yet, so there is nothing to delete. Registered as a no-op (not omitted)
 * so `GET /v1/retention/policies` and docs/compliance/data-map.md can
 * already reference this policy name; wire it to the real model once E08
 * ships `Report.photos`.
 */
export const reportPhotosDeletePolicy: RetentionPolicy = {
  name: 'report.photos.delete',
  legalHoldAware: true,
  async run(_dryRun: boolean) {
    return { matched: 0, affected: 0, cutoff: new Date() };
  },
};
