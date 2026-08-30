/**
 * VerdictEngine — pure tier-2 verdict engine (E06).
 *
 * No I/O, no framework dependencies, no NestJS decorators, no side effects.
 * The controller (or a thin service layer) is responsible for gathering the
 * VerdictContext from the database / code parser / rate limiter and then
 * handing it to `evaluate`. The engine never sees a raw tier-2 code — it only
 * receives `redactedCode`.
 */

export type Verdict =
  | 'invalid'
  | 'unknown'
  | 'ok'
  | 'authentic'
  | 'already-verified'
  | 'suspicious'
  | 'flagged'
  | 'decommissioned'
  | 'rate-limited';

export type Severity = 'green' | 'amber' | 'red' | 'grey';

export interface VerdictResult {
  verdict: Verdict;
  severity: Severity;
  tier?: 1 | 2;
  code: string; // ALWAYS redacted
  brand?: { slug: string; displayName: string; logoUrl?: string };
  product?: { id: string; name: string; sku: string; gtin?: string };
  batch?: { id: string; oem?: string; commissionedAt: string };
  message: string;
  history?: {
    firstVerifiedAt: string | null;
    scanCount: number;
    distinctRegions: string[];
    lastVerifiedAt: string | null;
  };
  signals?: {
    first: boolean;
    multiRegion: boolean;
    highCount: boolean;
    flagged: boolean;
  };
  retryAfterSec?: number;
  reportable: boolean;
}

export interface VerdictContext {
  parsed: {
    tenant: string;
    tier: 1 | 2;
    kid: string;
    payload: string;
    checksum: string;
    legacy: boolean;
  } | null;
  checksumOk: boolean;
  unit: {
    id: string;
    state: 'active' | 'flagged' | 'decommissioned';
    tenantId: string;
    batchId: string;
  } | null;
  tenant: {
    id: string;
    slug: string;
    status: 'pending' | 'active' | 'suspended' | 'offboarded';
    name: string;
    verifyRateLimitPerMin: number;
  } | null;
  product: { id: string; name: string; sku: string; gtin?: string } | null;
  batch: { id: string; oem?: string; commissionedAt: string } | null;
  priorScans: Array<{
    geoCity: string | null;
    geoCountry: string | null;
    createdAt: Date;
  }>;
  /** Geo of the scan being evaluated right now — not yet in `priorScans` (recorded after evaluation), but must count toward the region/suspicious decision and the response's `distinctRegions`. */
  currentGeo?: { city: string | null; country: string | null } | null;
  redactedCode: string;
  brandDisplayName: string;
  brandSlug: string;
  rateLimited: boolean;
  retryAfterSec?: number;
  now: Date;
}

/** Well-known messages, kept here so tests / callers can reference them. */
export const MESSAGES = {
  invalid:
    'This code format is not valid — check that you scanned the full code.',
  unknownTier1:
    'This public code is not in our registry. If this was scanned on a bottle, the product line may be counterfeit.',
  unknownTier2:
    'This verification code does not exist in our registry. This product is likely counterfeit. Please report it.',
  ok: (brand: string) =>
    `This is a genuine ${brand} product line. For full unit authentication, find the hidden scratch-off code inside the pack.`,
  authentic:
    'You are the first person to verify this unit. Genuine, purchased new.',
  alreadyVerified: (date: string, count: number) =>
    `This unit was first verified on ${date} and has been verified ${count} time(s). Normal for resale or shared use.`,
  suspicious:
    'This code has been verified multiple times in different regions — possible counterfeit duplication. Treat with caution and report.',
  flagged:
    'The brand has flagged this code after suspicious activity. Treat this product with caution and report the seller.',
  decommissioned:
    'This code has been withdrawn by the brand (recall or fraud investigation). Contact the seller.',
  rateLimited: 'Too many verification attempts. Please try again later.',
} as const;

/**
 * Format a single prior scan into a region string.
 * - both city + country -> "City, CC"
 * - city only           -> "City"
 * - country only        -> "CC"
 * - neither             -> skipped (returns null)
 */
function scanRegion(scan: {
  geoCity: string | null;
  geoCountry: string | null;
}): string | null {
  const city = scan.geoCity?.trim() || null;
  const country = scan.geoCountry?.trim() || null;
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

/**
 * Distinct, order-preserving list of region strings from prior scans, plus
 * the scan being evaluated right now (it isn't in `priorScans` yet — that
 * row is only written after the verdict is decided).
 */
function distinctRegions(
  priorScans: VerdictContext['priorScans'],
  currentGeo?: VerdictContext['currentGeo'],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (region: string | null) => {
    if (region && !seen.has(region)) {
      seen.add(region);
      out.push(region);
    }
  };
  for (const scan of priorScans) add(scanRegion(scan));
  if (currentGeo)
    add(
      scanRegion({ geoCity: currentGeo.city, geoCountry: currentGeo.country }),
    );
  return out;
}

export class VerdictEngine {
  /**
   * Evaluate a VerdictContext into a VerdictResult.
   *
   * Decision rows are evaluated top-to-bottom; first match wins. See the E06
   * epic / decision table for the authoritative spec.
   */
  evaluate(ctx: VerdictContext): VerdictResult {
    // --- Row 1: rate limit -------------------------------------------------
    if (ctx.rateLimited) {
      return {
        verdict: 'rate-limited',
        severity: 'grey',
        code: ctx.redactedCode,
        message: MESSAGES.rateLimited,
        retryAfterSec: ctx.retryAfterSec,
        reportable: false,
      };
    }

    // --- Row 2: unparseable / bad checksum --------------------------------
    if (ctx.parsed === null || !ctx.checksumOk) {
      return {
        verdict: 'invalid',
        severity: 'grey',
        code: ctx.redactedCode,
        message: MESSAGES.invalid,
        reportable: false,
      };
    }

    const tier = ctx.parsed.tier;

    // --- Row 3: offboarded tenant (regardless of tier) --------------------
    if (ctx.tenant?.status === 'offboarded') {
      return {
        verdict: 'unknown',
        severity: 'red',
        tier,
        code: ctx.redactedCode,
        message: MESSAGES.unknownTier2,
        reportable: true,
      };
    }

    // Common brand block included whenever a unit exists.
    const brand = ctx.unit
      ? { slug: ctx.brandSlug, displayName: ctx.brandDisplayName }
      : undefined;

    // --- Row 4: tier 1 -----------------------------------------------------
    if (tier === 1) {
      if (ctx.unit === null) {
        return {
          verdict: 'unknown',
          severity: 'red',
          tier: 1,
          code: ctx.redactedCode,
          message: MESSAGES.unknownTier1,
          reportable: true,
        };
      }
      return {
        verdict: 'ok',
        severity: 'green',
        tier: 1,
        code: ctx.redactedCode,
        brand,
        product: ctx.product ?? undefined,
        batch: ctx.batch ?? undefined,
        message: MESSAGES.ok(ctx.brandDisplayName),
        reportable: false,
      };
    }

    // --- Row 5: tier 2 -----------------------------------------------------
    // 5a. unit missing
    if (ctx.unit === null) {
      return {
        verdict: 'unknown',
        severity: 'red',
        tier: 2,
        code: ctx.redactedCode,
        message: MESSAGES.unknownTier2,
        reportable: true,
      };
    }

    // From here on, a unit exists — attach brand / product / batch.
    const regions = distinctRegions(ctx.priorScans, ctx.currentGeo);
    const scanCount = ctx.priorScans.length + 1;
    const signals = {
      first: ctx.priorScans.length === 0,
      multiRegion: regions.length > 1,
      highCount: scanCount > 5,
      flagged: ctx.unit.state === 'flagged',
    };
    const history = {
      firstVerifiedAt: ctx.priorScans[0]?.createdAt.toISOString() ?? null,
      scanCount,
      distinctRegions: regions,
      lastVerifiedAt:
        ctx.priorScans[ctx.priorScans.length - 1]?.createdAt.toISOString() ??
        null,
    };

    // 5b. decommissioned — no history emitted
    if (ctx.unit.state === 'decommissioned') {
      return {
        verdict: 'decommissioned',
        severity: 'red',
        tier: 2,
        code: ctx.redactedCode,
        brand,
        product: ctx.product ?? undefined,
        batch: ctx.batch ?? undefined,
        message: MESSAGES.decommissioned,
        reportable: false,
      };
    }

    // 5c. flagged — takes precedence over scan-count logic
    if (ctx.unit.state === 'flagged') {
      return {
        verdict: 'flagged',
        severity: 'red',
        tier: 2,
        code: ctx.redactedCode,
        brand,
        product: ctx.product ?? undefined,
        batch: ctx.batch ?? undefined,
        message: MESSAGES.flagged,
        history,
        signals,
        reportable: true,
      };
    }

    // 5d. first scan
    if (ctx.priorScans.length === 0) {
      return {
        verdict: 'authentic',
        severity: 'green',
        tier: 2,
        code: ctx.redactedCode,
        brand,
        product: ctx.product ?? undefined,
        batch: ctx.batch ?? undefined,
        message: MESSAGES.authentic,
        history,
        signals,
        reportable: false,
      };
    }

    // 5e. already-verified vs suspicious
    const totalScans = ctx.priorScans.length + 1;
    const singleRegion = regions.length <= 1;
    if (totalScans <= 5 || singleRegion) {
      return {
        verdict: 'already-verified',
        severity: 'green',
        tier: 2,
        code: ctx.redactedCode,
        brand,
        product: ctx.product ?? undefined,
        batch: ctx.batch ?? undefined,
        message: MESSAGES.alreadyVerified(
          ctx.priorScans[0].createdAt.toUTCString(),
          totalScans,
        ),
        history,
        signals,
        reportable: false,
      };
    }

    // 5f. suspicious: >5 total AND >1 distinct region
    return {
      verdict: 'suspicious',
      severity: 'amber',
      tier: 2,
      code: ctx.redactedCode,
      brand,
      product: ctx.product ?? undefined,
      batch: ctx.batch ?? undefined,
      message: MESSAGES.suspicious,
      history,
      signals,
      reportable: true,
    };
  }
}
