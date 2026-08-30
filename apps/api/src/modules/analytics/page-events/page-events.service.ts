import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ANALYTICS_REDIS } from '../redis-client.provider';
import { startOfUtcDay } from '../rollup/aggregate-scan-events';

const PENDING_SET = 'analytics:pageview:pending';
const COUNT_PREFIX = 'analytics:pageview:count:';
const SEP = ''; // never appears in a tenantId/route/locale, unlike ':' or '|'

interface Bucket {
  tenantId: string;
  date: string; // YYYY-MM-DD
  route: string;
  referrerType: string;
  locale: string;
}

function encodeBucket(b: Bucket): string {
  return `${COUNT_PREFIX}${b.tenantId}${SEP}${b.date}${SEP}${b.route}${SEP}${b.referrerType}${SEP}${b.locale}`;
}

function decodeBucket(key: string): Bucket | null {
  const parts = key.slice(COUNT_PREFIX.length).split(SEP);
  if (parts.length !== 5) return null;
  const [tenantId, date, route, referrerType, locale] = parts;
  return { tenantId, date, route, referrerType, locale };
}

/**
 * Buffers page-view beacons in Redis (one INCR per bucket, tracked in a
 * pending set) so a burst of `POST /v1/events/page` never writes to Postgres
 * synchronously. `flush()` is called on a 60s BullMQ repeat job and drains
 * every pending bucket into PageViewRollupDaily.
 */
@Injectable()
export class PageEventsService {
  constructor(
    @Inject(ANALYTICS_REDIS) private readonly redis: Redis,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  async record(
    tenantId: string,
    route: string,
    referrerType: string,
    locale: string,
    now: Date = new Date(),
  ): Promise<void> {
    const key = encodeBucket({
      tenantId,
      date: startOfUtcDay(now).toISOString().slice(0, 10),
      route,
      referrerType,
      locale,
    });
    await this.redis.multi().incr(key).sadd(PENDING_SET, key).exec();
  }

  async flush(): Promise<{ bucketsFlushed: number }> {
    const keys = await this.redis.smembers(PENDING_SET);
    let bucketsFlushed = 0;

    for (const key of keys) {
      const bucket = decodeBucket(key);
      const raw = await this.redis.get(key);
      const count = raw ? parseInt(raw, 10) : 0;

      if (bucket && count > 0) {
        await this.prisma.pageViewRollupDaily.upsert({
          where: {
            tenantId_date_route_referrerType_locale: {
              tenantId: bucket.tenantId,
              date: new Date(`${bucket.date}T00:00:00.000Z`),
              route: bucket.route,
              referrerType: bucket.referrerType,
              locale: bucket.locale,
            },
          },
          create: {
            tenantId: bucket.tenantId,
            date: new Date(`${bucket.date}T00:00:00.000Z`),
            route: bucket.route,
            referrerType: bucket.referrerType,
            locale: bucket.locale,
            count,
          },
          update: { count: { increment: count } },
        });
        bucketsFlushed += 1;
      }

      await this.redis.multi().del(key).srem(PENDING_SET, key).exec();
    }

    return { bucketsFlushed };
  }
}
