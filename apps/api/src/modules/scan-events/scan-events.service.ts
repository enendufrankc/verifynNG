import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, ScanEvent } from '@prisma/client';
import { hashIp, extractIpPrefix } from '../../common/ip-utils';
import { classifyUa } from '../../common/ua-utils';

export interface NewScanEvent {
  tenantId: string;
  unitId?: string | null;
  tier: 'tier1' | 'tier2';
  verdict: string;
  source?: 'qr' | 'manual' | 'sms' | 'api';
  code: string; // the full code (for redaction)
  redactedCode?: string; // pre-redacted code (preferred)
  ip?: string | null; // raw IP
  userAgent?: string | null;
  batchId?: string | null;
  productId?: string | null;
  geoCountry?: string | null;
  geoRegion?: string | null;
  geoCity?: string | null;
  latencyMs?: number;
}

@Injectable()
export class ScanEventsService {
  private readonly ipSalt: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    this.ipSalt = configService.get<string>('IP_HASH_SALT')!;
  }

  /**
   * Record a new scan event. The ONLY way to create ScanEvent records.
   * Handles IP hashing, UA classification, code redaction.
   */
  async record(event: NewScanEvent): Promise<ScanEvent> {
    // IP processing
    let ipHash: string | null = null;
    let ipPrefix: string | null = null;
    if (event.ip) {
      ipHash = hashIp(event.ip, this.ipSalt);
      ipPrefix = extractIpPrefix(event.ip);
    }

    // UA classification
    const deviceClass = classifyUa(event.userAgent ?? undefined);

    // Code redaction (use pre-redacted if provided)
    const codeRedacted = event.redactedCode ?? event.code.slice(0, 20) + '…';

    return this.prisma.scanEvent.create({
      data: {
        tenantId: event.tenantId,
        unitId: event.unitId ?? null,
        tier: event.tier,
        verdict: event.verdict,
        source: event.source ?? 'qr',
        codeRedacted,
        ipHash,
        ipPrefix,
        geoCountry: event.geoCountry ?? null,
        geoRegion: event.geoRegion ?? null,
        geoCity: event.geoCity ?? null,
        deviceClass,
        userAgent: event.userAgent ?? null,
        latencyMs: event.latencyMs ?? null,
        batchId: event.batchId ?? null,
        productId: event.productId ?? null,
      },
    });
  }

  /**
   * Get scan events for a specific unit and tier.
   */
  async forUnit(
    unitId: string,
    tier: 'tier1' | 'tier2',
    opts: { limit?: number } = {},
  ): Promise<ScanEvent[]> {
    return this.prisma.scanEvent.findMany({
      where: { unitId, tier },
      orderBy: { createdAt: 'asc' },
      take: opts.limit ?? 100,
    });
  }

  /**
   * Get scan events for a specific IP hash.
   */
  async byIpHash(
    ipHash: string,
    opts: { limit?: number } = {},
  ): Promise<ScanEvent[]> {
    return this.prisma.scanEvent.findMany({
      where: { ipHash },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
    });
  }

  /**
   * Stream scan events for a tenant since a given timestamp.
   * Used by E07/E12 for anomaly detection and analytics.
   */
  async *streamForTenant(
    tenantId: string,
    since: Date,
  ): AsyncGenerator<ScanEvent> {
    const batchSize = 100;
    let cursor: Date = since;

    for (;;) {
      const batch = await this.prisma.scanEvent.findMany({
        where: {
          tenantId,
          createdAt: { gt: cursor },
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });

      if (batch.length === 0) {
        return;
      }

      for (const event of batch) {
        yield event;
      }

      if (batch.length < batchSize) {
        return;
      }

      cursor = batch[batch.length - 1].createdAt;
    }
  }
}
