import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { RateLimitService, REDIS_CLIENT } from './rate-limit.service';

/**
 * EnumerationDetector — observes invalid scans per IP hash and, once the
 * configured threshold is crossed inside the observation window, hard-blocks
 * the IP, persists an `IpBlock` row, and emits a `scan.enumeration_detected`
 * domain event.
 *
 * The sliding-window counting is delegated to {@link RateLimitService} so the
 * detector only owns the "what happens when the threshold is hit" logic.
 */
@Injectable()
export class EnumerationDetector {
  private readonly logger = new Logger(EnumerationDetector.name);
  private readonly threshold: number;
  private readonly windowSec: number;
  private readonly blockSec: number;

  constructor(
    private readonly rateLimit: RateLimitService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.threshold = configService.get<number>(
      'ENUMERATION_INVALID_THRESHOLD',
    )!;
    this.windowSec = configService.get<number>('ENUMERATION_WINDOW_SEC')!;
    this.blockSec = configService.get<number>('ENUMERATION_BLOCK_SEC')!;
  }

  /**
   * Record one invalid scan for `ipHash`. When the count crosses the
   * threshold the IP is blocked for `blockSec` seconds and a domain event is
   * emitted.
   *
   * @returns `{ blocked: true }` when the threshold was just crossed,
   *          `{ blocked: false }` otherwise.
   */
  async observeInvalid(
    ipHash: string,
    tenantSlug?: string,
  ): Promise<{ blocked: boolean }> {
    const key = `enum:${ipHash}`;
    // `hit()` allows up to `limit` events and blocks starting at `limit + 1`;
    // we want the block to trip ON the `threshold`-th invalid observation
    // (so the very next request — of any kind — is already blocked), so the
    // limit passed in is one less than the configured threshold.
    const result = await this.rateLimit.hit(
      key,
      this.threshold - 1,
      this.windowSec,
    );

    if (!result.allowed) {
      // Block this IP in Redis (fast-path check for subsequent scans).
      await this.rateLimit.block(`ip:${ipHash}`, this.blockSec);

      // Persist the block in Postgres for auditability and lookups.
      await this.prisma.ipBlock.create({
        data: {
          ipHash,
          tenantSlug: tenantSlug ?? null,
          reason: 'enumeration',
          invalidCount: this.threshold,
          expiresAt: new Date(Date.now() + this.blockSec * 1000),
        },
      });

      // Notify the rest of the system (alerting, analytics, …) — and log it
      // so `scan.enumeration_detected` is visible via `docker compose logs`
      // even before any subscriber (E07/E17) exists.
      this.logger.warn(
        `scan.enumeration_detected ipHash=${ipHash} tenantSlug=${tenantSlug ?? '-'} invalidCount=${this.threshold} blockedForSec=${this.blockSec}`,
      );
      this.eventEmitter.emit('scan.enumeration_detected', {
        ipHash,
        tenantSlug: tenantSlug ?? null,
        invalidCount: this.threshold,
        windowSec: this.windowSec,
        blockedForSec: this.blockSec,
        at: new Date(),
      });

      return { blocked: true };
    }

    return { blocked: false };
  }
}
