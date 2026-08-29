import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { RateLimitService, REDIS_CLIENT } from './rate-limit.service';
import { EnumerationDetector } from './enumeration-detector';

const logger = new Logger('RedisClient');

/**
 * Redis client provider — a single shared ioredis instance wired from
 * `REDIS_URL`. `maxRetriesPerRequest` is capped so a request fails fast
 * instead of hanging when Redis is briefly unavailable. An `error` listener
 * is required: ioredis emits `error` on every failed reconnect attempt, and
 * an EventEmitter with zero `error` listeners crashes the process on the
 * first emit — which would turn a Redis outage into a full API crash
 * instead of the documented 503 degraded-mode response.
 */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    const redis = new Redis(configService.get<string>('REDIS_URL')!, {
      maxRetriesPerRequest: 3,
    });
    redis.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });
    return redis;
  },
  inject: [ConfigService],
};

/**
 * PrismaClient provider — a plain client (no append-only extension) so the
 * EnumerationDetector can write `IpBlock` rows directly.
 */
export const prismaClientProvider: Provider = {
  provide: PrismaClient,
  useFactory: () => new PrismaClient(),
};

/**
 * RateLimitModule — registers the Redis client, sliding-window rate limiter,
 * and enumeration detector. Exports the limiter, detector, and Redis client so
 * other modules (e.g. the verify controller) can enforce per-IP / per-code
 * limits and check hard-blocks.
 */
@Module({
  imports: [ConfigModule, EventEmitterModule],
  providers: [
    redisProvider,
    prismaClientProvider,
    RateLimitService,
    EnumerationDetector,
  ],
  exports: [RateLimitService, EnumerationDetector, REDIS_CLIENT],
})
export class RateLimitModule {}
