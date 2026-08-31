import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
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
import { setPublicApiApp } from '../../src/modules/public-api/app-holder';
import { DEPRECATIONS } from '../../src/modules/public-api/deprecations';

/**
 * AC9: marking a route in deprecations.ts (normally done on a throwaway
 * branch — DEPRECATIONS ships empty) carries Deprecation/Sunset/Link
 * headers and flips `deprecated: true` in the generated spec, with no
 * controller change. Mutates the shared map for the scope of this test
 * only, restoring it in afterEach — deliberately, not a mistake.
 */
describe('Deprecation headers (integration, AC9)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    setPublicApiApp(app);
    await app.init();
    appPrisma = app.get(PrismaClient);
    apiKeyService = app.get(ApiKeyService);
  }, 60_000);

  afterEach(() => {
    delete DEPRECATIONS['GET /api/v1/me'];
  });

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  it('carries no deprecation headers when the route is not listed', async () => {
    const t = await tenant(appPrisma);
    const key = (
      await apiKeyService.create(t.id, {
        name: 'k',
        scopes: ['read:batches'],
        createdById: 'user-1',
      })
    ).key;

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.sunset).toBeUndefined();
  });

  it('stamps Deprecation/Sunset/Link once GET /api/v1/me is listed in deprecations.ts', async () => {
    DEPRECATIONS['GET /api/v1/me'] = { sunset: '2027-09-01' };

    const t = await tenant(appPrisma);
    const key = (
      await apiKeyService.create(t.id, {
        name: 'k',
        scopes: ['read:batches'],
        createdById: 'user-1',
      })
    ).key;

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBe('Wed, 01 Sep 2027 00:00:00 GMT');
    expect(res.headers.link).toMatch(
      /^<https?:\/\/[^>]+\/api\/docs#deprecation-policy>; rel="deprecation"$/,
    );
  });

  it('reflects deprecated: true in the generated spec once listed', async () => {
    DEPRECATIONS['GET /api/v1/me'] = { sunset: '2027-09-01' };

    const res = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);
    expect(res.body.paths['/api/v1/me'].get.deprecated).toBe(true);
  });
});
