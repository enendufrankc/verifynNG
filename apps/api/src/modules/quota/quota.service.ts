/**
 * QuotaService — Redis-backed fixed-window tenant quotas.
 *
 * Uses Lua scripts for atomic INCRBY + EXPIRE.
 * Supports per-tenant overrides via the QuotaOverride table (cached 60s).
 * Emits 'quota.exceeded' events (debounced 1/min per tenant+kind).
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QuotaExceededError } from './quota-error.js';

export type QuotaWindow = 'minute' | 'hour' | 'day';

export interface QuotaKindConfig {
  defaultLimit: number;
  window: QuotaWindow;
}

interface OverrideCacheEntry {
  limit: number;
  window: QuotaWindow;
  fetchedAt: number;
}

interface ResolvedOverride {
  limit: number;
  window: QuotaWindow;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly kinds = new Map<string, QuotaKindConfig>();
  private readonly overrideCache = new Map<string, OverrideCacheEntry>();
  private readonly lastExceededEmit = new Map<string, number>();
  private static readonly OVERRIDE_CACHE_TTL = 60_000; // 60 seconds

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register a quota kind. Called at module init by other epics.
   */
  registerKind(kind: string, config: QuotaKindConfig): void {
    this.kinds.set(kind, config);
  }

  /**
   * Assert that a tenant is within quota. Throws QuotaExceededError if not.
   */
  async assertWithinQuota(
    tenantId: string,
    kind: string,
    opts?: { key?: string; cost?: number },
  ): Promise<void> {
    const config = this.kinds.get(kind);
    if (!config) {
      throw new Error(`Unknown quota kind: ${kind}`);
    }

    const override = await this.getOverride(tenantId, kind);
    const limit = override?.limit ?? config.defaultLimit;
    const window = override?.window ?? config.window;

    const { used, resetsAt } = await this.increment(
      tenantId,
      kind,
      window,
      opts?.key,
      opts?.cost ?? 1,
    );

    if (used > limit) {
      // Emit debounced event
      this.emitIfExpired(tenantId, kind, limit, used, window);

      throw new QuotaExceededError(
        tenantId,
        kind,
        limit,
        used,
        resetsAt,
        opts?.key,
      );
    }
  }

  /**
   * Peek at the current usage without incrementing.
   */
  async peek(
    tenantId: string,
    kind: string,
    key?: string,
  ): Promise<{ used: number; limit: number; resetsAt: Date }> {
    const config = this.kinds.get(kind);
    if (!config) {
      throw new Error(`Unknown quota kind: ${kind}`);
    }

    const override = await this.getOverride(tenantId, kind);
    const limit = override?.limit ?? config.defaultLimit;
    const window = override?.window ?? config.window;

    const redisKey = this.buildKey(tenantId, kind, key, window);
    const windowStart = this.windowStart(window);

    const results = await this.redis
      .multi()
      .get(redisKey)
      .pttl(redisKey)
      .exec();
    const [used] = results ?? [];

    const usedNum = Number(used?.[1] ?? 0);
    const resetsAt = new Date(windowStart + this.windowMs(window));

    return { used: usedNum, limit, resetsAt };
  }

  /**
   * Get all registered kinds with current usage for a tenant.
   */
  async getAllKinds(tenantId: string): Promise<
    Array<{
      kind: string;
      limit: number;
      used: number;
      window: QuotaWindow;
      resetsAt: Date;
    }>
  > {
    const results = [];
    for (const [kind, config] of this.kinds) {
      const { used, limit, resetsAt } = await this.peek(tenantId, kind);
      results.push({ kind, limit, used, window: config.window, resetsAt });
    }
    return results;
  }

  /**
   * Upsert a quota override for a tenant.
   */
  async upsertOverride(
    tenantId: string,
    kind: string,
    limit: number,
    window: QuotaWindow,
    note?: string,
    createdById?: string,
  ): Promise<void> {
    await this.prisma.quotaOverride.upsert({
      where: { tenantId_kind: { tenantId, kind } },
      update: { limit, window, note },
      create: { tenantId, kind, limit, window, note, createdById },
    });

    // Invalidate cache
    const cacheKey = `${tenantId}:${kind}`;
    this.overrideCache.delete(cacheKey);
  }

  // ── Private ──

  private async getOverride(
    tenantId: string,
    kind: string,
  ): Promise<ResolvedOverride | null> {
    const cacheKey = `${tenantId}:${kind}`;
    const cached = this.overrideCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.fetchedAt < QuotaService.OVERRIDE_CACHE_TTL
    ) {
      return { limit: cached.limit, window: cached.window };
    }

    const override = await this.prisma.quotaOverride.findUnique({
      where: { tenantId_kind: { tenantId, kind } },
    });

    if (override) {
      this.overrideCache.set(cacheKey, {
        limit: override.limit,
        window: override.window as QuotaWindow,
        fetchedAt: Date.now(),
      });
      return { limit: override.limit, window: override.window as QuotaWindow };
    }

    return null;
  }

  private async increment(
    tenantId: string,
    kind: string,
    window: QuotaWindow,
    key: string | undefined,
    cost: number,
  ): Promise<{ used: number; resetsAt: Date }> {
    const redisKey = this.buildKey(tenantId, kind, key, window);
    const windowMs = this.windowMs(window);

    // Lua script for atomic increment + expire
    const lua = `
      local key = KEYS[1]
      local cost = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local used = redis.call('INCRBY', key, cost)
      if used == cost then
        redis.call('PEXPIRE', key, windowMs)
      end
      return used
    `;

    const used = (await this.redis.eval(
      lua,
      1,
      redisKey,
      cost,
      windowMs,
    )) as number;
    const resetsAt = new Date(this.windowStart(window) + windowMs);

    return { used, resetsAt };
  }

  private buildKey(
    tenantId: string,
    kind: string,
    key: string | undefined,
    window: QuotaWindow,
  ): string {
    const windowStart = this.windowStart(window);
    const parts = ['quota', tenantId, kind];
    if (key) parts.push(key);
    parts.push(String(windowStart));
    return parts.join(':');
  }

  private windowStart(window: QuotaWindow): number {
    const now = Date.now();
    switch (window) {
      case 'minute':
        return now - (now % 60_000);
      case 'hour':
        return now - (now % 3_600_000);
      case 'day':
        return now - (now % 86_400_000);
    }
  }

  private windowMs(window: QuotaWindow): number {
    switch (window) {
      case 'minute':
        return 60_000;
      case 'hour':
        return 3_600_000;
      case 'day':
        return 86_400_000;
    }
  }

  private emitIfExpired(
    tenantId: string,
    kind: string,
    limit: number,
    used: number,
    window: QuotaWindow,
  ): void {
    const key = `${tenantId}:${kind}`;
    const lastEmit = this.lastExceededEmit.get(key) ?? 0;
    if (Date.now() - lastEmit < 60_000) return; // debounce 1/min

    this.lastExceededEmit.set(key, Date.now());
    this.eventEmitter.emit('quota.exceeded', {
      tenantId,
      kind,
      limit,
      used,
      window,
    });
  }
}
