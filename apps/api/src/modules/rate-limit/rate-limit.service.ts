import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RateLimitService — atomic sliding-window rate limiting backed by Redis.
 *
 * Uses a Lua script so the read-prune-write-expire sequence is executed
 * atomically by a single Redis EVAL, avoiding race conditions between
 * concurrent requests. The window is a sorted-set scored by millisecond
 * timestamp; members older than `now - window_ms` are pruned on every hit.
 */

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Lua script (sliding window):
 *   KEYS[1]  – the sorted-set key for this window
 *   ARGV[1]  – now (ms)
 *   ARGV[2]  – window size (ms)
 *   ARGV[3]  – limit (max events in the window)
 *   ARGV[4]  – unique member suffix (avoids ZADD overwrites for same-ms hits)
 *
 * Returns {allowed, remaining, retryAfterSec} as integers:
 *   allowed = 1 / 0
 *   remaining = limit - count (when allowed) / 0 (when blocked)
 *   retryAfterSec = seconds until the oldest event exits the window
 */
const SLIDING_WINDOW_LUA = `local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_ms)

local unique_member = now .. ':' .. ARGV[4]
redis.call('ZADD', key, now, unique_member)

local count = redis.call('ZCARD', key)

redis.call('PEXPIRE', key, window_ms)

if count <= limit then
  return {1, limit - count, 0}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = 0
  if #oldest >= 2 then
    retry_after = math.ceil((tonumber(oldest[2]) + window_ms - now) / 1000)
    if retry_after < 1 then retry_after = 1 end
  end
  return {0, 0, retry_after}
end`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Record one event against `key` and report whether it is within `limit`
   * for the trailing `windowSec` seconds.
   */
  async hit(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const uniqueId = Math.random().toString(36).slice(2);

    const result = (await this.redis.eval(
      SLIDING_WINDOW_LUA,
      1,
      key,
      now,
      windowMs,
      limit,
      uniqueId,
    )) as [number, number, number];

    const [allowed, remaining, retryAfterSec] = result;
    return { allowed: allowed === 1, remaining, retryAfterSec };
  }

  /**
   * Hard-block a key for `ttlSec` (used after the enumeration threshold is
   * crossed). Subsequent `isBlocked` checks return true until the TTL expires.
   */
  async block(key: string, ttlSec: number): Promise<void> {
    await this.redis.set(`block:${key}`, '1', 'EX', ttlSec);
  }

  /**
   * Whether `key` is currently hard-blocked via {@link block}.
   */
  async isBlocked(key: string): Promise<boolean> {
    const exists = await this.redis.exists(`block:${key}`);
    return exists === 1;
  }
}
