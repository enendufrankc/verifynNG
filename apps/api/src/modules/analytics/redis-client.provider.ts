import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const ANALYTICS_REDIS = Symbol('ANALYTICS_REDIS');

const logger = new Logger('AnalyticsRedisClient');

// A dedicated client (rather than importing RateLimitModule's) keeps this
// module's owned-paths boundary clean — see docs/epics/README.md's hot-spot
// rules. Same error-listener requirement as RateLimitModule's: ioredis emits
// `error` on every failed reconnect, and zero listeners crashes the process.
export const analyticsRedisProvider: Provider = {
  provide: ANALYTICS_REDIS,
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
