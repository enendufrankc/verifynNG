import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@verifynng/db';
import type { RetentionRun } from '@prisma/client';
import { EventsService } from '../../common/events.service';
import { TenantOffboardingProcessor } from '../../jobs/tenant-offboarding.processor';
import { DsarStorageService } from '../dsar/dsar-storage.service';
import type { RetentionPolicy } from './policies/policy.types';
import { scanEventGeoCityScrubPolicy } from './policies/scan-event-geo-city-scrub.policy';
import { scanEventUserAgentScrubPolicy } from './policies/scan-event-user-agent-scrub.policy';
import { sessionDeletePolicy } from './policies/session-delete.policy';
import { probeResultDeletePolicy } from './policies/probe-result-delete.policy';
import { createDsarExportDeletePolicy } from './policies/dsar-export-delete.policy';
import { createTenantOffboardedPurgePolicy } from './policies/tenant-offboarded-purge.policy';
import { reportPhotosDeletePolicy } from './policies/report-photos-delete.policy';
import { usageEventDeletePolicy } from './policies/usage-event-delete.policy';

const DRY_RUN_FRESHNESS_MS = 24 * 3600_000;

@Injectable()
export class RetentionRunnerService {
  private readonly policies: RetentionPolicy[];

  constructor(
    private readonly events: EventsService,
    offboarding: TenantOffboardingProcessor,
    dsarStorage: DsarStorageService,
  ) {
    this.policies = [
      scanEventGeoCityScrubPolicy,
      scanEventUserAgentScrubPolicy,
      sessionDeletePolicy,
      probeResultDeletePolicy,
      createDsarExportDeletePolicy(dsarStorage),
      createTenantOffboardedPurgePolicy(offboarding),
      reportPhotosDeletePolicy,
      usageEventDeletePolicy,
    ];
  }

  listPolicies(): { name: string; legalHoldAware: boolean }[] {
    return this.policies.map((p) => ({
      name: p.name,
      legalHoldAware: p.legalHoldAware,
    }));
  }

  async listRuns(policy?: string): Promise<RetentionRun[]> {
    return prisma.retentionRun.findMany({
      where: policy ? { policy } : undefined,
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Retention runs are platform-wide, not tenant-scoped (a single run
   * processes every tenant's Sessions/ScanEvents at once), so there is no
   * real per-tenant "affected count" to show a tenant owner. This gives
   * tenants the schedule plus the last wet-run timestamp per policy —
   * timestamps only, no counts (those could leak platform-wide volume
   * information a tenant has no business seeing).
   */
  async scheduleSummary(): Promise<
    { name: string; legalHoldAware: boolean; lastRanAt: string | null }[]
  > {
    const lastRuns = await prisma.retentionRun.groupBy({
      by: ['policy'],
      where: { dryRun: false, error: null },
      _max: { finishedAt: true },
    });
    const lastRanByPolicy = new Map(
      lastRuns.map((r) => [r.policy, r._max.finishedAt]),
    );
    return this.policies.map((p) => ({
      name: p.name,
      legalHoldAware: p.legalHoldAware,
      lastRanAt: lastRanByPolicy.get(p.name)?.toISOString() ?? null,
    }));
  }

  async run(opts: {
    dryRun: boolean;
    policyName?: string;
    triggeredBy: string;
  }): Promise<RetentionRun[]> {
    const targets = opts.policyName
      ? this.policies.filter((p) => p.name === opts.policyName)
      : this.policies;
    if (opts.policyName && targets.length === 0) {
      throw new NotFoundException('unknown_policy');
    }

    if (opts.policyName && !opts.dryRun) {
      await this.assertRecentDryRun(opts.policyName);
    }

    const results: RetentionRun[] = [];
    for (const policy of targets) {
      const startedAt = new Date();
      if (!opts.dryRun) {
        const hasFreshDryRun = await this.hasFreshDryRun(policy.name);
        if (!hasFreshDryRun) {
          const run = await prisma.retentionRun.create({
            data: {
              policy: policy.name,
              dryRun: false,
              cutoff: startedAt,
              matched: 0,
              affected: 0,
              startedAt,
              finishedAt: new Date(),
              error: 'no_recent_dry_run',
              triggeredBy: opts.triggeredBy,
            },
          });
          results.push(run);
          continue;
        }
      }
      try {
        const { matched, affected, cutoff } = await policy.run(opts.dryRun);
        const run = await prisma.retentionRun.create({
          data: {
            policy: policy.name,
            dryRun: opts.dryRun,
            cutoff,
            matched,
            affected,
            startedAt,
            finishedAt: new Date(),
            triggeredBy: opts.triggeredBy,
          },
        });
        await this.events.emit('retention.executed', {
          runId: run.id,
          policy: policy.name,
          dryRun: opts.dryRun,
          matched,
          affected,
          durationMs: run.finishedAt!.getTime() - startedAt.getTime(),
          at: new Date().toISOString(),
        });
        results.push(run);
      } catch (error) {
        const run = await prisma.retentionRun.create({
          data: {
            policy: policy.name,
            dryRun: opts.dryRun,
            cutoff: startedAt,
            matched: 0,
            affected: 0,
            startedAt,
            finishedAt: new Date(),
            error: error instanceof Error ? error.message : 'unknown_error',
            triggeredBy: opts.triggeredBy,
          },
        });
        results.push(run);
        // Failure isolation: one policy failing doesn't stop the others.
      }
    }
    return results;
  }

  private async hasFreshDryRun(policyName: string): Promise<boolean> {
    const recent = await prisma.retentionRun.findFirst({
      where: {
        policy: policyName,
        dryRun: true,
        error: null,
        startedAt: { gte: new Date(Date.now() - DRY_RUN_FRESHNESS_MS) },
      },
      orderBy: { startedAt: 'desc' },
    });
    return recent !== null;
  }

  private async assertRecentDryRun(policyName: string): Promise<void> {
    if (!(await this.hasFreshDryRun(policyName))) {
      throw new ConflictException({
        error: 'no_recent_dry_run',
        policy: policyName,
      });
    }
  }
}
