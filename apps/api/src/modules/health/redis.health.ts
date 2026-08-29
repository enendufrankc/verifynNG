import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const env = loadEnv();
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
    try {
      await redis.connect();
      await redis.ping();
      return this.getStatus(key, true);
    } catch {
      return this.getStatus(key, false);
    } finally {
      await redis.quit();
    }
  }
}
