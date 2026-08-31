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

describe('PublicApiModule (integration)', () => {
  let app: INestApplication;
  let dbPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let schemaName: string;
  let apiKeyService: ApiKeyService;

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  it('GET /api/v1/me returns tenant, key prefix, scopes and rate limit for a valid key', async () => {
    const t = await tenant(appPrisma);
    const { key, record } = await apiKeyService.create(t.id, {
      name: 'ERP',
      scopes: ['read:batches', 'write:batches'],
      createdById: 'user-1',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);

    expect(res.body).toEqual({
      tenantId: t.id,
      keyPrefix: record.prefix,
      scopes: ['read:batches', 'write:batches'],
      rateLimit: { perMinute: 120 },
    });
    expect(res.headers['apiversion']).toBe('2026-09-01');
  });

  it('rejects a missing or malformed Authorization header with the E16 envelope', async () => {
    // No requestId assertion: ApiKeyGuard rejects before RequestContextInterceptor
    // runs (Nest evaluates guards before interceptors), so the AsyncLocalStorage
    // context isn't established yet — the same is true of every other route's
    // GlobalExceptionFilter, this isn't E16-specific.
    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .expect(401);

    expect(res.body.error).toMatchObject({
      type: 'unauthorized',
      docs: expect.stringContaining('/api/docs#errors'),
    });
  });

  it('rejects a revoked key', async () => {
    const t = await tenant(appPrisma);
    const { key, record } = await apiKeyService.create(t.id, {
      name: 'revoked',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });
    await apiKeyService.revoke(t.id, record.id, 'user-1');

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(401);
  });

  it('never reaches the internal console router with a vk_ bearer token', async () => {
    const t = await tenant(appPrisma);
    const { key } = await apiKeyService.create(t.id, {
      name: 'internal-probe',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    await request(app.getHttpServer())
      .get(`/tenants/${t.id}/api-keys`)
      .set('Authorization', `Bearer ${key}`)
      .expect(401);
  });
});
