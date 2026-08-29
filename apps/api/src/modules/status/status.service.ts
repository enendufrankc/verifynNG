import { Injectable, Logger, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@verifynng/db';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface IngestProbeDto {
  target: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  verdict?: string;
  region?: string;
  at?: string;
}

export type StatusState = 'operational' | 'degraded' | 'outage';

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private db: PrismaClient;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Optional() dbClient?: PrismaClient,
  ) {
    this.db = dbClient || prisma;
  }

  async ingestProbe(dto: IngestProbeDto) {
    const at = dto.at ? new Date(dto.at) : new Date();

    const record = await this.db.probeResult.create({
      data: {
        target: dto.target,
        ok: dto.ok,
        statusCode: dto.statusCode,
        latencyMs: dto.latencyMs,
        verdict: dto.verdict,
        region: dto.region || 'local',
        at,
      },
    });

    // Check recent failures to emit probe.failed event
    const recent = await this.db.probeResult.findMany({
      where: { target: dto.target },
      orderBy: { at: 'desc' },
      take: 5,
    });

    const consecutiveFailures = recent.filter(
      (r: { ok: boolean }) => !r.ok,
    ).length;
    if (!dto.ok && consecutiveFailures >= 2) {
      this.eventEmitter.emit('probe.failed', {
        target: dto.target,
        statusCode: dto.statusCode,
        latencyMs: dto.latencyMs,
        at: at.toISOString(),
      });
    }

    return record;
  }

  async getOverallStatus() {
    const targets = ['verify-api', 'web-verify', 'web-admin'];
    const components = await Promise.all(
      targets.map(async (target) => {
        const state = await this.deriveComponentState(target);
        const stats = await this.get24hStats(target);
        return {
          name: target,
          state,
          p95Ms24h: stats.p95Ms,
          uptime30dPct: stats.uptimePct,
        };
      }),
    );

    const hasOutage = components.some((c) => c.state === 'outage');
    const hasDegraded = components.some((c) => c.state === 'degraded');

    const overallState: StatusState = hasOutage
      ? 'outage'
      : hasDegraded
        ? 'degraded'
        : 'operational';

    return {
      state: overallState,
      updatedAt: new Date().toISOString(),
      components,
      incidents: [],
    };
  }

  async deriveComponentState(target: string): Promise<StatusState> {
    const recent5 = await this.db.probeResult.findMany({
      where: { target },
      orderBy: { at: 'desc' },
      take: 5,
    });

    if (recent5.length === 0) return 'operational';

    const recentFailures5 = recent5.filter(
      (r: { ok: boolean }) => !r.ok,
    ).length;
    if (recentFailures5 >= 3) return 'outage';

    const recent10 = await this.db.probeResult.findMany({
      where: { target },
      orderBy: { at: 'desc' },
      take: 10,
    });

    const recentFailures10 = recent10.filter(
      (r: { ok: boolean }) => !r.ok,
    ).length;

    const stats = await this.get24hStats(target);

    if (recentFailures10 >= 1 || stats.p95Ms > 300) {
      return 'degraded';
    }

    return 'operational';
  }

  async get24hStats(target: string) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const results = await this.db.probeResult.findMany({
      where: {
        target,
        at: { gte: dayAgo },
      },
      select: { ok: true, latencyMs: true },
    });

    if (results.length === 0) {
      return { p95Ms: 0, uptimePct: 100 };
    }

    const successful = results.filter((r: { ok: boolean }) => r.ok).length;
    const uptimePct = Number(((successful / results.length) * 100).toFixed(2));

    const latencies = results
      .map((r: { latencyMs: number }) => r.latencyMs)
      .sort((a: number, b: number) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Ms = latencies[p95Index] || 0;

    return { p95Ms, uptimePct };
  }

  async getHistory(days = 30) {
    const daysNumber = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - daysNumber * 24 * 60 * 60 * 1000);

    const history = await this.db.statusDaily.findMany({
      where: {
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    return history;
  }
}
