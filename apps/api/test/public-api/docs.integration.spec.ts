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
import { AppModule } from '../../src/app.module';
import { setPublicApiApp } from '../../src/modules/public-api/app-holder';

describe('Public API docs (integration)', () => {
  let app: INestApplication;
  let dbPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let schemaName: string;

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  it('GET /api/openapi.json is public, valid JSON, and covers every /api/v1 route', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);

    const paths = Object.keys(res.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/me',
        '/api/v1/batches',
        '/api/v1/batches/{id}',
        '/api/v1/batches/{id}/units',
        '/api/v1/units/{id}',
        '/api/v1/units/{id}/flag',
        '/api/v1/units/{id}/decommission',
        '/api/v1/units/{id}/restore',
        '/api/v1/scans',
        '/api/v1/reports',
        '/api/v1/reports/{id}',
      ]),
    );
    // /api/docs and /api/openapi.json themselves are excluded from their own spec.
    expect(paths).not.toContain('/api/docs');
    expect(paths).not.toContain('/api/openapi.json');
    expect(res.body.components.securitySchemes.apiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('GET /api/docs is public and renders the Scalar HTML page', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').expect(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('verifynNG Public API');
  });

  it('neither doc route requires an API key', async () => {
    await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
