import { RuleId } from './rule-types';

/**
 * Rules whose window is measured in days get a day-granularity dedupe
 * bucket; the rest (short, minute-scale windows) get an hour-granularity
 * bucket. A new bucket means a new `Anomaly` row (the unique `dedupeKey`
 * permanently "spends" the old one, even after it's resolved) — this is
 * what lets the same unit/IP produce a fresh anomaly on a later day/hour
 * instead of colliding with a long-resolved one.
 */
const DAY_BUCKET_RULES: RuleId[] = [
  'geo_dispersion',
  'dead_code',
  'pre_reveal',
];

export function bucketFor(rule: RuleId, at: Date): string {
  const iso = at.toISOString();
  return DAY_BUCKET_RULES.includes(rule) ? iso.slice(0, 10) : iso.slice(0, 13);
}

/**
 * `${tenantId}:${rule}:${unitId ?? batchId ?? ipHash}:${windowBucket}` — the
 * `source` suffix keeps the sweep path's discoveries in a separate lineage
 * from the event path's for the two rules that run both ways, so a sweep
 * run never collides with (or silently escalates) an anomaly the live
 * verify path already raised for the same unit on the same day.
 */
export function computeDedupeKey(args: {
  tenantId: string;
  rule: RuleId;
  keyPart: string;
  at: Date;
  source: 'event' | 'sweep';
}): string {
  const bucket = bucketFor(args.rule, args.at);
  const suffix =
    args.rule === 'geo_dispersion' || args.rule === 'dead_code'
      ? `:${args.source}`
      : '';
  return `${args.tenantId}:${args.rule}:${args.keyPart}:${bucket}${suffix}`;
}
