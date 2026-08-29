import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { RateLimitService, REDIS_CLIENT } from './rate-limit.service';
import { EnumerationDetector } from './enumeration-detector';

/**
 * Redis client provider — a single shared ioredis instance wired from
 * `REDIS_URL`. `maxRetriesPerRequest` is capped so a request fails fast
 * instead of hanging when Redis is briefly unavailable.
 */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    return new Redis(configService.get<string>('REDIS_URL')!, {
      maxRetriesPerRequest: 3,
    });
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
