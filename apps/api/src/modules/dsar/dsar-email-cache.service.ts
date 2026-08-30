import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Consumers are identified everywhere else by a salted hash — never a raw
 * email (see subjectRef on ConsentRecord/DsarRequest). But delivering the
 * `dsar.verify`/`dsar.ready`/`dsar.erased` mail needs the real address, and
 * the request→verify round trip can be up to 30 minutes apart across two
 * separate HTTP calls. This holds the address only for that window, in
 * Redis (never Postgres), keyed by dsarRequestId, and is deleted the
 * moment it's read.
 */
@Injectable()
export class DsarEmailCache implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL')!, {
      maxRetriesPerRequest: null,
    });
  }

  private key(dsarRequestId: string): string {
    return `dsar:email:${dsarRequestId}`;
  }

  async set(
    dsarRequestId: string,
    email: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(this.key(dsarRequestId), email, 'EX', ttlSeconds);
  }

  async takeAndClear(dsarRequestId: string): Promise<string | null> {
    const key = this.key(dsarRequestId);
    const value = await this.redis.get(key);
    if (value) await this.redis.del(key);
    return value;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
