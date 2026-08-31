import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant } from '@verifynng/db/testing';
import { AppModule } from '../../src/app.module';
import { ApiKeyService } from '../../src/modules/api-keys/api-key.service';
import { QuotaService } from '../../src/modules/quota/quota.service';
import { PUBLIC_API_QUOTA_KIND } from '../../src/modules/public-api/constants';

describe('RateLimitInterceptor (integration)', () => {
  let app: INestApplication;
  let dbPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let schemaName: string;
  let apiKeyService: ApiKeyService;
  let quotaService: QuotaService;

  beforeAll(async () => {
    const testDb = await createTestDatabase(__filename);
    dbPrisma = testDb.prisma;
    schemaName = testDb.schemaName;
    process.env.DATABASE_URL = testDb.databaseUrl;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // main.ts's bootstrap() (which sets this up) never runs under
    // Test.createTestingModule — without it every DTO validation is a no-op.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    appPrisma = app.get(PrismaClient);
    apiKeyService = app.get(ApiKeyService);
    quotaService = app.get(QuotaService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  it('returns 429 with Retry-After and X-RateLimit-Remaining: 0 once the per-tenant limit is exceeded, and sets rate-limit headers on success', async () => {
    const t = await tenant(appPrisma);
    await quotaService.upsertOverride(t.id, PUBLIC_API_QUOTA_KIND, 2, 'minute');
    const { key } = await apiKeyService.create(t.id, {
      name: 'ERP',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    const first = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(first.headers['x-ratelimit-limit']).toBe('2');
    expect(first.headers['x-ratelimit-remaining']).toBe('1');

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);

    const third = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(429);

    expect(third.headers['retry-after']).toBeDefined();
    expect(third.headers['x-ratelimit-remaining']).toBe('0');
    expect(third.body.error).toMatchObject({ type: 'rate_limited' });
  });

  it('rate limits per key, not per tenant as a whole — a second key on the same tenant is unaffected', async () => {
    const t = await tenant(appPrisma);
    await quotaService.upsertOverride(t.id, PUBLIC_API_QUOTA_KIND, 1, 'minute');
    const keyA = await apiKeyService.create(t.id, {
      name: 'A',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });
    const keyB = await apiKeyService.create(t.id, {
      name: 'B',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${keyA.key}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${keyA.key}`)
      .expect(429);

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${keyB.key}`)
      .expect(200);
  });
});
