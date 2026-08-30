import { Injectable, Logger } from '@nestjs/common';
import { Anomaly, Prisma, PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { loadEnv } from '@verifynng/config';
import { RulesService } from './rules/rules.service';
import { RuleId, asThresholds } from './rules/rule-types';
import { computeDedupeKey } from './rules/dedupe';
import {
  evaluateDeadCode,
  evaluateDuplicateFirst,
  evaluateGeoDispersion,
  evaluatePreReveal,
  evaluateVelocity,
} from './rules/pure-rules';
import { UnitLifecycleService } from '../units/unit-lifecycle.service';

export type EvidenceScanRef = {
  scanEventId: string;
  at: Date;
  city: string | null;
  country: string | null;
};

interface UpsertArgs {
  tenantId: string;
  rule: RuleId;
  unitId: string | null;
  batchId: string | null;
  keyPart: string;
  source: 'event' | 'sweep';
  score: number;
  autoFlagAt: number;
  at: Date;
  scans: EvidenceScanRef[];
  computed?: Record<string, unknown>;
  thresholds: Record<string, number>;
  summary: string;
}

// Rules that alert but must never auto-flag the unit, regardless of score —
// velocity has no single unit to flag; pre_reveal is deliberately alert-only
// (legitimate pre-ship handling is common).
const NEVER_AUTO_FLAG: RuleId[] = ['velocity', 'pre_reveal'];

/**
 * AnomalyEngine — the only writer of `Anomaly` rows. Consumes one
 * `ScanEvent` at a time (via the BullMQ `evaluate` job) or a sweep's
 * pre-computed hit, runs the relevant pure rules, and dedupes/escalates/
 * auto-flags through `upsertAnomaly`.
 */
@Injectable()
export class AnomalyEngine {
  private readonly logger = new Logger(AnomalyEngine.name);
  private readonly alertDebounceMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly rules: RulesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly lifecycle: UnitLifecycleService,
  ) {
    this.alertDebounceMs = loadEnv().ANOMALY_ALERT_DEBOUNCE_MIN * 60_000;
  }

  async evaluate(scanEventId: string): Promise<void> {
    const scan = await this.prisma.scanEvent.findUnique({
      where: { id: scanEventId },
    });
    if (!scan) return;

    const effective = await this.rules.effective(scan.tenantId);

    if (scan.unitId && scan.batchId && scan.tier === 'tier2') {
      const batch = await this.prisma.batch.findUnique({
        where: { id: scan.batchId },
        select: { status: true, expectedShipDate: true },
      });

      if (
        batch &&
        effective.dead_code.enabled &&
        evaluateDeadCode(scan.tier, batch.status)
      ) {
        await this.upsertAnomaly({
          tenantId: scan.tenantId,
          rule: 'dead_code',
          unitId: scan.unitId,
          batchId: scan.batchId,
          keyPart: scan.unitId,
          source: 'event',
          score: effective.dead_code.score,
          autoFlagAt: effective.dead_code.autoFlagAt,
          at: scan.createdAt,
          scans: [
            {
              scanEventId: scan.id,
              at: scan.createdAt,
              city: scan.geoCity,
              country: scan.geoCountry,
            },
          ],
          computed: { batchStatus: batch.status },
          thresholds: effective.dead_code.thresholds,
          summary: `Tier-2 code scanned while batch is '${batch.status}'`,
        });
      }

      if (
        batch &&
        effective.pre_reveal.enabled &&
        evaluatePreReveal(
          scan.tier,
          scan.createdAt,
          batch.expectedShipDate,
          asThresholds<{ graceDays: number }>(effective.pre_reveal.thresholds),
        )
      ) {
        await this.upsertAnomaly({
          tenantId: scan.tenantId,
          rule: 'pre_reveal',
          unitId: scan.unitId,
          batchId: scan.batchId,
          keyPart: scan.unitId,
          source: 'event',
          score: effective.pre_reveal.score,
          autoFlagAt: effective.pre_reveal.autoFlagAt,
          at: scan.createdAt,
          scans: [
            {
              scanEventId: scan.id,
              at: scan.createdAt,
              city: scan.geoCity,
              country: scan.geoCountry,
            },
          ],
          computed: { expectedShipDate: batch.expectedShipDate },
          thresholds: effective.pre_reveal.thresholds,
          summary: `Tier-2 code scanned before its batch's expected ship date`,
        });
      }

      if (effective.duplicate_first.enabled) {
        const previous = await this.prisma.scanEvent.findFirst({
          where: { unitId: scan.unitId, tier: 'tier2', id: { not: scan.id } },
          orderBy: { createdAt: 'desc' },
        });
        const result = evaluateDuplicateFirst(
          {
            scanEventId: scan.id,
            geoCity: scan.geoCity,
            createdAt: scan.createdAt,
          },
          previous
            ? {
                scanEventId: previous.id,
                geoCity: previous.geoCity,
                createdAt: previous.createdAt,
              }
            : null,
          asThresholds<{ windowMinutes: number; minDistanceKm: number }>(
            effective.duplicate_first.thresholds,
          ),
        );
        if (result) {
          await this.upsertAnomaly({
            tenantId: scan.tenantId,
            rule: 'duplicate_first',
            unitId: scan.unitId,
            batchId: scan.batchId,
            keyPart: scan.unitId,
            source: 'event',
            score: effective.duplicate_first.score,
            autoFlagAt: effective.duplicate_first.autoFlagAt,
            at: scan.createdAt,
            scans: [result.previous, result.current].map((s) => ({
              scanEventId: s.scanEventId,
              at: s.at,
              city: s.city,
              country: null,
            })),
            computed: { distanceKm: result.distanceKm },
            thresholds: effective.duplicate_first.thresholds,
            summary: `Same unit scanned twice ${Math.round(result.distanceKm)}km apart within the window`,
          });
        }
      }

      if (effective.geo_dispersion.enabled) {
        const windowStart = new Date(
          scan.createdAt.getTime() -
            effective.geo_dispersion.thresholds.windowDays * 86_400_000,
        );
        const scansForUnit = await this.prisma.scanEvent.findMany({
          where: {
            unitId: scan.unitId,
            tier: 'tier2',
            createdAt: { gte: windowStart },
          },
          orderBy: { createdAt: 'asc' },
        });
        const result = evaluateGeoDispersion(
          scansForUnit.map((s) => ({
            scanEventId: s.id,
            geoCity: s.geoCity,
            geoCountry: s.geoCountry,
            createdAt: s.createdAt,
          })),
          asThresholds<{ distinctCities: number; windowDays: number }>(
            effective.geo_dispersion.thresholds,
          ),
          scan.createdAt,
        );
        if (result) {
          await this.upsertAnomaly({
            tenantId: scan.tenantId,
            rule: 'geo_dispersion',
            unitId: scan.unitId,
            batchId: scan.batchId,
            keyPart: scan.unitId,
            source: 'event',
            score: effective.geo_dispersion.score,
            autoFlagAt: effective.geo_dispersion.autoFlagAt,
            at: scan.createdAt,
            scans: result.cities.map((c) => ({
              scanEventId: c.scanEventId,
              at: c.at,
              city: c.city,
              country: c.country,
            })),
            thresholds: effective.geo_dispersion.thresholds,
            summary: `Verified from ${result.cities.length} distinct cities within the window`,
          });
        }
      }
    }

    if (effective.velocity.enabled && scan.ipHash) {
      const windowStart = new Date(
        scan.createdAt.getTime() -
          effective.velocity.thresholds.windowMinutes * 60_000,
      );
      const scansByIp = await this.prisma.scanEvent.findMany({
        where: {
          tenantId: scan.tenantId,
          ipHash: scan.ipHash,
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: 'asc' },
      });
      const result = evaluateVelocity(
        scansByIp.map((s) => ({
          scanEventId: s.id,
          unitId: s.unitId,
          batchId: s.batchId,
          createdAt: s.createdAt,
        })),
        asThresholds<{ distinctUnits: number; windowMinutes: number }>(
          effective.velocity.thresholds,
        ),
        scan.createdAt,
      );
      if (result) {
        await this.upsertAnomaly({
          tenantId: scan.tenantId,
          rule: 'velocity',
          unitId: null,
          batchId: result.batchId,
          keyPart: scan.ipHash,
          source: 'event',
          score: effective.velocity.score,
          autoFlagAt: effective.velocity.autoFlagAt,
          at: scan.createdAt,
          scans: result.unitIds.map((id) => ({
            scanEventId: id,
            at: scan.createdAt,
            city: null,
            country: null,
          })),
          computed: { distinctUnitCount: result.distinctUnitCount },
          thresholds: effective.velocity.thresholds,
          summary: `${result.distinctUnitCount} distinct units verified from one source in the window`,
        });
      }
    }
  }

  /**
   * Direct entry point for `scan.enumeration_detected` — the endpoint already
   * decided this IP is enumerating; that's velocity evidence even without a
   * fresh `scan.recorded` to re-derive it from.
   */
  async evaluateEnumeration(payload: {
    ipHash: string;
    tenantSlug: string | null;
    invalidCount: number;
    windowSec: number;
    at: Date;
  }): Promise<void> {
    if (!payload.tenantSlug) return; // no tenant to attribute this to — nothing to raise
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: payload.tenantSlug },
    });
    if (!tenant) return;

    const effective = await this.rules.effective(tenant.id);
    if (!effective.velocity.enabled) return;

    await this.upsertAnomaly({
      tenantId: tenant.id,
      rule: 'velocity',
      unitId: null,
      batchId: null,
      keyPart: payload.ipHash,
      source: 'event',
      score: effective.velocity.score,
      autoFlagAt: effective.velocity.autoFlagAt,
      at: payload.at,
      scans: [],
      computed: {
        invalidCount: payload.invalidCount,
        windowSec: payload.windowSec,
      },
      thresholds: effective.velocity.thresholds,
      summary: `${payload.invalidCount} invalid tier-2 lookups from one source triggered enumeration blocking`,
    });
  }

  async upsertAnomaly(args: UpsertArgs): Promise<Anomaly | null> {
    const dedupeKey = computeDedupeKey({
      tenantId: args.tenantId,
      rule: args.rule,
      keyPart: args.keyPart,
      at: args.at,
      source: args.source,
    });

    const existing = await this.prisma.anomaly.findUnique({
      where: { dedupeKey },
    });

    let anomaly: Anomaly;
    let created: boolean;

    if (!existing) {
      anomaly = await this.prisma.anomaly.create({
        data: {
          tenantId: args.tenantId,
          rule: args.rule,
          unitId: args.unitId,
          batchId: args.batchId,
          score: args.score,
          evidence: {
            scans: args.scans,
            thresholds: args.thresholds,
            computed: args.computed ?? {},
            source: args.source,
          } as Prisma.InputJsonValue,
          dedupeKey,
          lastAlertAt: args.at,
        },
      });
      created = true;
    } else {
      const existingScans =
        ((existing.evidence as Record<string, unknown>)
          .scans as EvidenceScanRef[]) ?? [];
      const existingIds = new Set(existingScans.map((s) => s.scanEventId));
      const newScans = args.scans.filter(
        (s) => !existingIds.has(s.scanEventId),
      );

      if (existing.status !== 'open' || newScans.length === 0) {
        // No new evidence (or the anomaly is already closed out) — idempotent no-op,
        // just keep lastSeenAt honest for open anomalies re-confirmed by a sweep.
        if (existing.status === 'open') {
          await this.prisma.anomaly.update({
            where: { id: existing.id },
            data: { lastSeenAt: args.at },
          });
        }
        return existing.status === 'open' ? existing : null;
      }

      const mergedScans = [...existingScans, ...newScans].slice(-50);
      const previousScore = existing.score;
      const nextScore = Math.min(100, existing.score + args.score);

      anomaly = await this.prisma.anomaly.update({
        where: { id: existing.id },
        data: {
          score: nextScore,
          lastSeenAt: args.at,
          evidence: {
            scans: mergedScans,
            thresholds: args.thresholds,
            computed: args.computed ?? {},
            source: args.source,
          } as Prisma.InputJsonValue,
        },
      });
      created = false;

      this.eventEmitter.emit('anomaly.escalated', {
        anomalyId: anomaly.id,
        tenantId: args.tenantId,
        rule: args.rule,
        previousScore,
        score: nextScore,
      });
    }

    const autoFlagged = await this.maybeAutoFlag(anomaly, args.summary);

    const shouldAlert =
      created ||
      !anomaly.lastAlertAt ||
      args.at.getTime() - anomaly.lastAlertAt.getTime() >= this.alertDebounceMs;

    if (shouldAlert) {
      if (!created) {
        await this.prisma.anomaly.update({
          where: { id: anomaly.id },
          data: { lastAlertAt: args.at },
        });
      }
      const alertContext = await this.buildAlertContext(anomaly);
      this.eventEmitter.emit('anomaly.detected', {
        anomalyId: anomaly.id,
        tenantId: args.tenantId,
        rule: args.rule,
        score: anomaly.score,
        unitId: anomaly.unitId ?? undefined,
        batchId: anomaly.batchId ?? undefined,
        autoFlagged,
        summary: args.summary,
        // anomaly.alert template contract (docs/epics/E07-anomaly-detection.md)
        ...alertContext,
      });
    }

    return anomaly;
  }

  /** Fields the `anomaly.alert` template needs beyond the engine's own event contract. */
  private async buildAlertContext(anomaly: Anomaly): Promise<{
    tenantName: string;
    unitRef?: string;
    batchRef?: string;
    cities: string[];
    adminUrl: string;
  }> {
    const [tenant, unit, batch] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: anomaly.tenantId },
        select: { name: true },
      }),
      anomaly.unitId
        ? this.prisma.unit.findUnique({
            where: { id: anomaly.unitId },
            select: { tier1Code: true },
          })
        : null,
      anomaly.batchId
        ? this.prisma.batch.findUnique({
            where: { id: anomaly.batchId },
            select: { watermark: true },
          })
        : null,
    ]);

    const evidence = anomaly.evidence as {
      scans?: Array<{ city: string | null }>;
    } | null;
    const cities = [
      ...new Set(
        (evidence?.scans ?? [])
          .map((s) => s.city)
          .filter((c): c is string => !!c),
      ),
    ];

    return {
      tenantName: tenant?.name ?? 'Unknown tenant',
      unitRef: unit?.tier1Code,
      batchRef: batch?.watermark,
      cities,
      adminUrl: `${loadEnv().APP_BASE_URL}/anomalies/${anomaly.id}`,
    };
  }

  private async maybeAutoFlag(
    anomaly: Anomaly,
    reasonSummary: string,
  ): Promise<boolean> {
    if (NEVER_AUTO_FLAG.includes(anomaly.rule as RuleId)) return false;
    if (!anomaly.unitId) return false;

    const effective = await this.rules.effective(anomaly.tenantId);
    const ruleDef = effective[anomaly.rule as RuleId];
    if (anomaly.score < ruleDef.autoFlagAt) return false;

    const unit = await this.prisma.unit.findUnique({
      where: { id: anomaly.unitId },
    });
    if (!unit || unit.state !== 'active') return false;

    try {
      await this.lifecycle.flag(anomaly.tenantId, anomaly.unitId, {
        actor: { type: 'system' },
        reason: `auto-flagged: ${anomaly.rule} anomaly (score ${anomaly.score}) — ${reasonSummary}`,
        anomalyId: anomaly.id,
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `auto-flag failed for unit=${anomaly.unitId}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
