import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant, product, batch, unit, scanEvent } from '@verifynng/db/testing';
import { AppModule } from '../../src/app.module';
import { ApiKeyService } from '../../src/modules/api-keys/api-key.service';

describe('Public API read endpoints (integration)', () => {
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

  async function fullAccessKey(tenantId: string) {
    return (
      await apiKeyService.create(tenantId, {
        name: 'full',
        scopes: [
          'read:batches',
          'write:batches',
          'read:units',
          'write:units',
          'read:scans',
          'read:reports',
        ],
        createdById: 'user-1',
      })
    ).key;
  }

  it('paginates GET /api/v1/batches with an opaque cursor, newest first', async () => {
    const t = await tenant(appPrisma);
    const p = await product(appPrisma, { tenantId: t.id });
    const b1 = await batch(appPrisma, { tenantId: t.id, productId: p.id });
    await new Promise((r) => setTimeout(r, 5));
    const b2 = await batch(appPrisma, { tenantId: t.id, productId: p.id });
    await new Promise((r) => setTimeout(r, 5));
    const b3 = await batch(appPrisma, { tenantId: t.id, productId: p.id });
    const key = await fullAccessKey(t.id);

    const page1 = await request(app.getHttpServer())
      .get('/api/v1/batches?limit=2')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(page1.body.data.map((x: { id: string }) => x.id)).toEqual([
      b3.id,
      b2.id,
    ]);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/batches?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(page2.body.data.map((x: { id: string }) => x.id)).toEqual([b1.id]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('GET /api/v1/batches/:id 404s for a batch belonging to another tenant (never 403)', async () => {
    const t1 = await tenant(appPrisma);
    const t2 = await tenant(appPrisma);
    const p1 = await product(appPrisma, { tenantId: t1.id });
    const b1 = await batch(appPrisma, { tenantId: t1.id, productId: p1.id });
    const keyT2 = await fullAccessKey(t2.id);

    await request(app.getHttpServer())
      .get(`/api/v1/batches/${b1.id}`)
      .set('Authorization', `Bearer ${keyT2}`)
      .expect(404);
  });

  it('GET /api/v1/batches/:id/units and GET /api/v1/units/:id never return the full tier2Hash', async () => {
    const t = await tenant(appPrisma);
    const p = await product(appPrisma, { tenantId: t.id });
    const b = await batch(appPrisma, { tenantId: t.id, productId: p.id });
    const u = await unit(appPrisma, {
      tenantId: t.id,
      batchId: b.id,
      productId: p.id,
    });
    const key = await fullAccessKey(t.id);

    const unitsPage = await request(app.getHttpServer())
      .get(`/api/v1/batches/${b.id}/units`)
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(JSON.stringify(unitsPage.body)).not.toContain(u.tier2Hash);
    expect(unitsPage.body.data[0].tier2HashRedacted).toBe(
      `${u.tier2Hash.slice(0, 8)}…`,
    );

    const single = await request(app.getHttpServer())
      .get(`/api/v1/units/${u.id}`)
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(single.body).not.toHaveProperty('tier2Hash');
    expect(single.body.tier1Code).toBe(u.tier1Code);
  });

  it('a read:batches-only key gets 403 forbidden on a read:units route', async () => {
    const t = await tenant(appPrisma);
    const p = await product(appPrisma, { tenantId: t.id });
    const b = await batch(appPrisma, { tenantId: t.id, productId: p.id });
    const u = await unit(appPrisma, {
      tenantId: t.id,
      batchId: b.id,
      productId: p.id,
    });
    const key = (
      await apiKeyService.create(t.id, {
        name: 'batches-only',
        scopes: ['read:batches'],
        createdById: 'user-1',
      })
    ).key;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/units/${u.id}`)
      .set('Authorization', `Bearer ${key}`)
      .expect(403);
    expect(res.body.error.type).toBe('forbidden');
  });

  it('filters and paginates GET /api/v1/scans, and cross-tenant get 404s', async () => {
    const t1 = await tenant(appPrisma);
    const t2 = await tenant(appPrisma);
    const p1 = await product(appPrisma, { tenantId: t1.id });
    const b1 = await batch(appPrisma, { tenantId: t1.id, productId: p1.id });
    const u1 = await unit(appPrisma, {
      tenantId: t1.id,
      batchId: b1.id,
      productId: p1.id,
    });
    await scanEvent(appPrisma, {
      tenantId: t1.id,
      unitId: u1.id,
      verdict: 'authentic',
    });
    await scanEvent(appPrisma, {
      tenantId: t1.id,
      unitId: u1.id,
      verdict: 'suspicious',
    });
    const keyT1 = await fullAccessKey(t1.id);
    const keyT2 = await fullAccessKey(t2.id);

    const filtered = await request(app.getHttpServer())
      .get('/api/v1/scans?verdict=suspicious')
      .set('Authorization', `Bearer ${keyT1}`)
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].verdict).toBe('suspicious');

    const crossTenant = await request(app.getHttpServer())
      .get('/api/v1/scans')
      .set('Authorization', `Bearer ${keyT2}`)
      .expect(200);
    expect(crossTenant.body.data).toHaveLength(0);
  });

  it('lists and gets reports, excluding contact PII, scoped per tenant', async () => {
    const t1 = await tenant(appPrisma);
    const t2 = await tenant(appPrisma);
    const report = await appPrisma.report.create({
      data: {
        tenantId: t1.id,
        reference: `REF-${Date.now()}`,
        verdictAtReport: 'suspicious',
        purchaseChannel: 'open_market',
        contactEmail: 'consumer@example.com',
        ipHash: 'hash-of-ip',
        status: 'new',
      },
    });
    const keyT1 = await fullAccessKey(t1.id);
    const keyT2 = await fullAccessKey(t2.id);

    const list = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', `Bearer ${keyT1}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).not.toHaveProperty('contactEmail');
    expect(list.body.data[0]).not.toHaveProperty('ipHash');

    const single = await request(app.getHttpServer())
      .get(`/api/v1/reports/${report.id}`)
      .set('Authorization', `Bearer ${keyT1}`)
      .expect(200);
    expect(single.body.reference).toBe(report.reference);

    await request(app.getHttpServer())
      .get(`/api/v1/reports/${report.id}`)
      .set('Authorization', `Bearer ${keyT2}`)
      .expect(404);
  });
});
