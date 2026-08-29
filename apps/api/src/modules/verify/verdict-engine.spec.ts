import { describe, it, expect } from 'vitest';
import { VerdictEngine, VerdictContext, VerdictResult } from './verdict-engine';

// ---------------------------------------------------------------------------
// Context builder helper
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-15T12:00:00Z');

const baseParsed = {
  tenant: 'ivoryglow',
  kid: 'kid-1',
  payload: 'ABCDEFGH',
  checksum: 'deadbeef',
  legacy: false,
} as const;

const baseTenant = {
  id: 'tenant-1',
  slug: 'ivoryglow',
  status: 'active' as const,
  name: 'Ivory Glow',
  verifyRateLimitPerMin: 60,
};

const baseUnit = {
  id: 'unit-1',
  state: 'active' as const,
  tenantId: 'tenant-1',
  batchId: 'batch-1',
};

const baseProduct = { id: 'prod-1', name: 'Serum', sku: 'SKU-1', gtin: '0123' };
const baseBatch = { id: 'batch-1', oem: 'OEM-A', commissionedAt: '2024-12-01' };

type CtxOverrides = Partial<VerdictContext> & {
  tier?: 1 | 2;
  priorScanRegions?: Array<{ city: string | null; country: string | null }>;
};

function makeCtx(overrides: CtxOverrides = {}): VerdictContext {
  const tier = overrides.tier ?? 2;
  const { tier: _omitTier = undefined, priorScanRegions, ...rest } = overrides;
  void _omitTier;

  const priorScans: VerdictContext['priorScans'] = (priorScanRegions ?? []).map(
    (r, i) => ({
      geoCity: r.city,
      geoCountry: r.country,
      createdAt: new Date(NOW.getTime() - (i + 1) * 86_400_000), // descending recency
    }),
  );

  return {
    parsed: { ...baseParsed, tier },
    checksumOk: true,
    unit: { ...baseUnit },
    tenant: { ...baseTenant },
    product: { ...baseProduct },
    batch: { ...baseBatch },
    priorScans,
    redactedCode: 'XXXX••••',
    brandDisplayName: 'Ivory Glow',
    brandSlug: 'ivoryglow',
    rateLimited: false,
    retryAfterSec: undefined,
    now: NOW,
    ...rest,
  };
}

const engine = new VerdictEngine();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VerdictEngine', () => {
  // 1. Invalid code (parsed = null)
  it('returns invalid when parsed is null', () => {
    const r = engine.evaluate(makeCtx({ parsed: null }));
    expect(r).toMatchObject({
      verdict: 'invalid',
      severity: 'grey',
      reportable: false,
    });
    expect(r.message).toBe(
      'This code format is not valid — check that you scanned the full code.',
    );
    expect(r.tier).toBeUndefined();
  });

  // 2. Invalid code (checksumOk = false)
  it('returns invalid when checksumOk is false', () => {
    const r = engine.evaluate(makeCtx({ checksumOk: false }));
    expect(r.verdict).toBe('invalid');
    expect(r.severity).toBe('grey');
    expect(r.reportable).toBe(false);
  });

  // 3. Rate-limited (wins over everything)
  it('returns rate-limited and is grey / non-reportable', () => {
    const r = engine.evaluate(
      makeCtx({ rateLimited: true, retryAfterSec: 42, parsed: null }),
    );
    expect(r).toMatchObject({
      verdict: 'rate-limited',
      severity: 'grey',
      reportable: false,
      retryAfterSec: 42,
    });
    expect(r.message).toBe(
      'Too many verification attempts. Please try again later.',
    );
  });

  // 4. Tier 1, unit found → ok
  it('returns ok (green) for tier 1 with a unit', () => {
    const r = engine.evaluate(makeCtx({ tier: 1 }));
    expect(r).toMatchObject({
      verdict: 'ok',
      severity: 'green',
      tier: 1,
      reportable: false,
    });
    expect(r.brand).toEqual({ slug: 'ivoryglow', displayName: 'Ivory Glow' });
    expect(r.product).toEqual(baseProduct);
    expect(r.batch).toEqual(baseBatch);
    // no history/signals for tier 1
    expect(r.history).toBeUndefined();
    expect(r.signals).toBeUndefined();
  });

  // 5. Tier 1, unit not found → unknown (tier-1 message)
  it('returns unknown (tier-1 message) for tier 1 with no unit', () => {
    const r = engine.evaluate(makeCtx({ tier: 1, unit: null }));
    expect(r).toMatchObject({
      verdict: 'unknown',
      severity: 'red',
      tier: 1,
      reportable: true,
    });
    expect(r.message).toContain('public code');
  });

  // 6. Tier 2, unit not found → unknown (tier-2 message)
  it('returns unknown (tier-2 message) for tier 2 with no unit', () => {
    const r = engine.evaluate(makeCtx({ unit: null }));
    expect(r).toMatchObject({
      verdict: 'unknown',
      severity: 'red',
      tier: 2,
      reportable: true,
    });
    expect(r.message).toContain('likely counterfeit');
  });

  // 7. Tier 2, decommissioned → decommissioned, no history
  it('returns decommissioned (red) with no history', () => {
    const r = engine.evaluate(
      makeCtx({
        unit: { ...baseUnit, state: 'decommissioned' },
        priorScanRegions: [{ city: 'Lagos', country: 'NG' }],
      }),
    );
    expect(r).toMatchObject({
      verdict: 'decommissioned',
      severity: 'red',
      reportable: false,
    });
    expect(r.history).toBeUndefined();
    expect(r.signals).toBeUndefined();
  });

  // 8. Tier 2, first scan → authentic
  it('returns authentic (green) for the first scan', () => {
    const r = engine.evaluate(makeCtx({ priorScanRegions: [] }));
    expect(r).toMatchObject({
      verdict: 'authentic',
      severity: 'green',
      reportable: false,
    });
    expect(r.signals).toEqual({
      first: true,
      multiRegion: false,
      highCount: false,
      flagged: false,
    });
    expect(r.history).toEqual({
      firstVerifiedAt: null,
      scanCount: 1,
      distinctRegions: [],
      lastVerifiedAt: null,
    });
  });

  // 9. Tier 2, 5 scans, single region → already-verified
  it('returns already-verified for 5 scans in a single region', () => {
    const regions = Array.from({ length: 5 }, () => ({
      city: 'Lagos',
      country: 'NG',
    }));
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    expect(r.verdict).toBe('already-verified');
    expect(r.severity).toBe('green');
    expect(r.reportable).toBe(false);
    expect(r.history?.scanCount).toBe(6);
    expect(r.history?.distinctRegions).toEqual(['Lagos, NG']);
    expect(r.signals?.highCount).toBe(true);
    expect(r.signals?.multiRegion).toBe(false);
  });

  // 10. Tier 2, 6 scans, single region → already-verified (single-region rule)
  it('returns already-verified for 6 scans in a single region', () => {
    const regions = Array.from({ length: 6 }, () => ({
      city: 'Lagos',
      country: 'NG',
    }));
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    expect(r.verdict).toBe('already-verified');
    expect(r.severity).toBe('green');
    expect(r.history?.scanCount).toBe(7);
    expect(r.signals?.multiRegion).toBe(false);
  });

  // 11. Tier 2, 6 scans, 2 regions → suspicious
  it('returns suspicious for >5 scans across >1 region', () => {
    const regions = [
      ...Array.from({ length: 3 }, () => ({ city: 'Lagos', country: 'NG' })),
      ...Array.from({ length: 3 }, () => ({ city: 'Paris', country: 'FR' })),
    ];
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    expect(r).toMatchObject({
      verdict: 'suspicious',
      severity: 'amber',
      reportable: true,
    });
    expect(r.history?.distinctRegions).toEqual(['Lagos, NG', 'Paris, FR']);
    expect(r.signals?.multiRegion).toBe(true);
    expect(r.signals?.highCount).toBe(true);
  });

  // 11b. AC2: the region-diversifying scan is the CURRENT one (not yet
  // written to priorScans) — must be suspicious on this very call, not the
  // next one.
  it('returns suspicious when the current (unrecorded) scan is the second region', () => {
    const priorScanRegions = Array.from({ length: 5 }, () => ({
      city: 'Lagos',
      country: 'NG',
    }));
    const r = engine.evaluate(
      makeCtx({
        priorScanRegions,
        currentGeo: { city: 'Accra', country: 'GH' },
      }),
    );
    expect(r.verdict).toBe('suspicious');
    expect(r.severity).toBe('amber');
    expect(r.reportable).toBe(true);
    expect(r.history?.distinctRegions).toEqual(['Lagos, NG', 'Accra, GH']);
    expect(r.signals?.multiRegion).toBe(true);
  });

  // 12. Tier 2, flagged state → flagged even on first scan
  it('returns flagged (red, reportable) regardless of scan count', () => {
    const r = engine.evaluate(
      makeCtx({
        unit: { ...baseUnit, state: 'flagged' },
        priorScanRegions: [],
      }),
    );
    expect(r).toMatchObject({
      verdict: 'flagged',
      severity: 'red',
      reportable: true,
    });
    expect(r.signals?.flagged).toBe(true);
    expect(r.signals?.first).toBe(true);
    expect(r.history?.scanCount).toBe(1);
  });

  // 13. Offboarded tenant → unknown (regardless of tier)
  it('returns unknown for an offboarded tenant, even with a unit', () => {
    const r = engine.evaluate(
      makeCtx({
        tier: 2,
        tenant: { ...baseTenant, status: 'offboarded' },
      }),
    );
    expect(r).toMatchObject({
      verdict: 'unknown',
      severity: 'red',
      reportable: true,
    });
  });

  it('returns unknown for an offboarded tenant at tier 1 too', () => {
    const r = engine.evaluate(
      makeCtx({
        tier: 1,
        tenant: { ...baseTenant, status: 'offboarded' },
      }),
    );
    expect(r.verdict).toBe('unknown');
    expect(r.severity).toBe('red');
    expect(r.reportable).toBe(true);
  });

  // 14. Suspended tenant → verifies normally
  it('verifies normally for a suspended tenant', () => {
    const r = engine.evaluate(
      makeCtx({
        tier: 2,
        tenant: { ...baseTenant, status: 'suspended' },
        priorScanRegions: [],
      }),
    );
    expect(r.verdict).toBe('authentic');
  });

  it('verifies normally for a pending tenant', () => {
    const r = engine.evaluate(
      makeCtx({
        tier: 1,
        tenant: { ...baseTenant, status: 'pending' },
      }),
    );
    expect(r.verdict).toBe('ok');
  });

  // 15. Message interpolation (brand name in ok message)
  it('interpolates the brand name into the ok message', () => {
    const r = engine.evaluate(
      makeCtx({ tier: 1, brandDisplayName: 'Acme Corp' }),
    );
    expect(r.message).toBe(
      'This is a genuine Acme Corp product line. For full unit authentication, find the hidden scratch-off code inside the pack.',
    );
  });

  // 16. Message interpolation (date in already-verified)
  it('interpolates the first-verified date and count into already-verified', () => {
    const regions = [{ city: 'Lagos', country: 'NG' }];
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    const expectedDate = new Date(NOW.getTime() - 86_400_000).toUTCString();
    expect(r.message).toBe(
      `This unit was first verified on ${expectedDate} and has been verified 2 time(s). Normal for resale or shared use.`,
    );
  });

  // 17. Code field always matches the redacted pattern
  it('never exposes more than the redacted code', () => {
    const cases: VerdictContext[] = [
      makeCtx({ parsed: null }),
      makeCtx({ checksumOk: false }),
      makeCtx({ rateLimited: true }),
      makeCtx({ tier: 1 }),
      makeCtx({ tier: 1, unit: null }),
      makeCtx({ unit: null }),
      makeCtx({ unit: { ...baseUnit, state: 'decommissioned' } }),
      makeCtx({ priorScanRegions: [] }),
      makeCtx({
        priorScanRegions: Array.from({ length: 6 }, () => ({
          city: 'Lagos',
          country: 'NG',
        })),
      }),
      makeCtx({
        priorScanRegions: [
          ...Array.from({ length: 3 }, () => ({
            city: 'Lagos',
            country: 'NG',
          })),
          ...Array.from({ length: 3 }, () => ({
            city: 'Paris',
            country: 'FR',
          })),
        ],
      }),
      makeCtx({ unit: { ...baseUnit, state: 'flagged' } }),
      makeCtx({ tenant: { ...baseTenant, status: 'offboarded' } }),
    ];

    for (const ctx of cases) {
      const r: VerdictResult = engine.evaluate(ctx);
      // redactedCode in these tests is always exactly 8 chars and contains •
      expect(r.code).toBe(ctx.redactedCode);
      expect(r.code).toMatch(/•/);
    }
  });

  // --- additional edge cases ---------------------------------------------

  it('region formatting: city-only and country-only and empty', () => {
    const regions = [
      { city: 'Lagos', country: 'NG' }, // "Lagos, NG"
      { city: 'Paris', country: null }, // "Paris"
      { city: null, country: 'FR' }, // "FR"
      { city: null, country: null }, // skipped
    ];
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    // 4 prior scans + 1 = 5 total, single-ish region set but >1 distinct →
    // totalScans = 5, which is <=5, so already-verified regardless.
    expect(r.verdict).toBe('already-verified');
    expect(r.history?.distinctRegions).toEqual(['Lagos, NG', 'Paris', 'FR']);
  });

  it('first scan has no regions and signals.first is true', () => {
    const r = engine.evaluate(makeCtx({ priorScanRegions: [] }));
    expect(r.history?.distinctRegions).toEqual([]);
    expect(r.signals?.first).toBe(true);
  });

  it('history.firstVerifiedAt / lastVerifiedAt are ISO strings from prior scans', () => {
    const regions = [
      { city: 'Lagos', country: 'NG' },
      { city: 'Abuja', country: 'NG' },
    ];
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    // priorScans built with descending recency: index 0 is most recent.
    const scans = makeCtx({ priorScanRegions: regions }).priorScans;
    expect(r.history?.firstVerifiedAt).toBe(scans[0].createdAt.toISOString());
    expect(r.history?.lastVerifiedAt).toBe(
      scans[scans.length - 1].createdAt.toISOString(),
    );
  });

  it('flagged beats already-verified even with many multi-region scans', () => {
    const regions = [
      ...Array.from({ length: 4 }, () => ({ city: 'Lagos', country: 'NG' })),
      ...Array.from({ length: 4 }, () => ({ city: 'Paris', country: 'FR' })),
    ];
    const r = engine.evaluate(
      makeCtx({
        unit: { ...baseUnit, state: 'flagged' },
        priorScanRegions: regions,
      }),
    );
    expect(r.verdict).toBe('flagged');
    expect(r.severity).toBe('red');
    expect(r.reportable).toBe(true);
  });

  it('decommissioned beats flagged precedence (checked first in tier-2 branch)', () => {
    // state can only be one value, but ensure decommissioned path is hit first
    const r = engine.evaluate(
      makeCtx({ unit: { ...baseUnit, state: 'decommissioned' } }),
    );
    expect(r.verdict).toBe('decommissioned');
    expect(r.reportable).toBe(false);
  });

  it('omits brand/product/batch when unit is null', () => {
    const r = engine.evaluate(makeCtx({ unit: null }));
    expect(r.brand).toBeUndefined();
    expect(r.product).toBeUndefined();
    expect(r.batch).toBeUndefined();
  });

  it('includes brand/product/batch when unit exists (tier 2 authentic)', () => {
    const r = engine.evaluate(makeCtx({ priorScanRegions: [] }));
    expect(r.brand).toBeDefined();
    expect(r.product).toEqual(baseProduct);
    expect(r.batch).toEqual(baseBatch);
  });

  it('rate-limited wins even when parsed is valid and unit exists', () => {
    const r = engine.evaluate(
      makeCtx({
        rateLimited: true,
        retryAfterSec: 10,
        tier: 2,
        priorScanRegions: [],
      }),
    );
    expect(r.verdict).toBe('rate-limited');
    expect(r.retryAfterSec).toBe(10);
    expect(r.tier).toBeUndefined();
  });

  it('boundary: exactly 5 total scans, 2 regions → already-verified (<=5)', () => {
    const regions = [
      { city: 'Lagos', country: 'NG' },
      { city: 'Lagos', country: 'NG' },
      { city: 'Lagos', country: 'NG' },
      { city: 'Paris', country: 'FR' },
    ]; // 4 prior + 1 = 5 total, 2 distinct regions
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    expect(r.verdict).toBe('already-verified');
  });

  it('boundary: exactly 6 total scans, 2 regions → suspicious', () => {
    const regions = [
      { city: 'Lagos', country: 'NG' },
      { city: 'Lagos', country: 'NG' },
      { city: 'Lagos', country: 'NG' },
      { city: 'Lagos', country: 'NG' },
      { city: 'Paris', country: 'FR' },
    ]; // 5 prior + 1 = 6 total, 2 distinct
    const r = engine.evaluate(makeCtx({ priorScanRegions: regions }));
    expect(r.verdict).toBe('suspicious');
    expect(r.severity).toBe('amber');
  });
});

// ---------------------------------------------------------------------------
// Property test: evaluate() never leaks a full code, across every branch.
// ---------------------------------------------------------------------------

describe('VerdictEngine — code redaction property', () => {
  const rawPayload = 'THISSHOULDNEVERAPPEAR12345';

  const branches: Array<[string, CtxOverrides]> = [
    ['invalid (parsed null)', { parsed: null }],
    ['invalid (checksum bad)', { checksumOk: false }],
    ['rate-limited', { rateLimited: true, retryAfterSec: 1 }],
    ['tier1 ok', { tier: 1 }],
    ['tier1 unknown', { tier: 1, unit: null }],
    ['tier2 unknown', { unit: null }],
    [
      'tier2 decommissioned',
      { unit: { ...baseUnit, state: 'decommissioned' } },
    ],
    [
      'tier2 flagged',
      { unit: { ...baseUnit, state: 'flagged' }, priorScanRegions: [] },
    ],
    ['tier2 authentic', { priorScanRegions: [] }],
    [
      'tier2 already-verified',
      { priorScanRegions: [{ city: 'Lagos', country: 'NG' }] },
    ],
    [
      'tier2 suspicious',
      {
        priorScanRegions: [
          { city: 'Lagos', country: 'NG' },
          { city: 'Lagos', country: 'NG' },
          { city: 'Lagos', country: 'NG' },
          { city: 'Lagos', country: 'NG' },
          { city: 'Paris', country: 'FR' },
        ],
      },
    ],
  ];

  it.each(branches)(
    '%s: code is exactly redactedCode, never the raw payload',
    (_label, overrides) => {
      for (let i = 0; i < 25; i++) {
        const redactedCode = `ivoryglow.2.k1.${Math.random().toString(36).slice(2, 6).toUpperCase()}…`;
        const r = engine.evaluate(
          makeCtx({
            ...overrides,
            redactedCode,
            parsed:
              overrides.parsed === null
                ? null
                : { ...baseParsed, tier: overrides.tier ?? 2 },
          }),
        );
        expect(r.code).toBe(redactedCode);
        expect(r.code).not.toContain(rawPayload);
        expect(JSON.stringify(r)).not.toContain(rawPayload);
      }
    },
  );
});
