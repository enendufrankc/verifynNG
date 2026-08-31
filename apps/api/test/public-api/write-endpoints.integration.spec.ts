import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  prisma as sharedPrisma,
} from '@verifynng/db';
import { tenant, product, oem, batch, unit } from '@verifynng/db/testing';
import { AppModule } from '../../src/app.module';
import { ApiKeyService } from '../../src/modules/api-keys/api-key.service';

describe('Public API write endpoints (integration)', () => {
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

  async function fullAccessKey(tenantId: string) {
    return (
      await apiKeyService.create(tenantId, {
        name: 'full',
        scopes: ['read:batches', 'write:batches', 'read:units', 'write:units'],
        createdById: 'user-1',
      })
    ).key;
  }

  describe('POST /api/v1/batches', () => {
    it('mints, replays identically on a repeated key+body, and 409s on a mismatched body, per AC2', async () => {
      // MintService injects Prisma via the legacy 'PRISMA' value-provider
      // token (@verifynng/db's module-level singleton, bound to whatever
      // DATABASE_URL was live when this file's static imports resolved —
      // before this test's isolated per-schema DATABASE_URL was set),
      // unlike every other service here (AuditService included) which
      // injects the PrismaClient *class* token (a factory bound at Nest
      // bootstrap time, correctly isolated). Seed product/oem in the shared
      // connection MintService actually queries, and mirror the same tenant
      // id into both connections — AuditService needs it in the isolated
      // schema (AuditLog.tenantId is a real FK), MintService needs it in
      // the shared one (reads the tenant's slug for code generation).
      const t = await tenant(appPrisma);
      await tenant(sharedPrisma as unknown as PrismaClient, {
        id: t.id,
        slug: t.slug,
      });
      const p = await product(sharedPrisma as unknown as PrismaClient, {
        tenantId: t.id,
      });
      const o = await oem(sharedPrisma as unknown as PrismaClient, {
        tenantId: t.id,
      });
      const key = await fullAccessKey(t.id);
      const idemKey = `demo-${randomUUID()}`;

      const first = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${key}`)
        .set('Idempotency-Key', idemKey)
        .send({ productId: p.id, oemId: o.id, count: 100 })
        .expect(202);
      expect(first.body.batch.count).toBe(100);
      expect(first.headers.location).toBe(
        `/api/v1/batches/${first.body.batch.id}`,
      );

      const replay = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${key}`)
        .set('Idempotency-Key', idemKey)
        .send({ productId: p.id, oemId: o.id, count: 100 })
        .expect(202);
      expect(replay.body).toEqual(first.body);

      const batchCount = await sharedPrisma.batch.count({
        where: { tenantId: t.id },
      });
      expect(batchCount).toBe(1);

      const mismatched = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${key}`)
        .set('Idempotency-Key', idemKey)
        .send({ productId: p.id, oemId: o.id, count: 200 })
        .expect(409);
      expect(mismatched.body.error.type).toBe('idempotency_mismatch');

      // Cleanup: these fixtures live in the shared (non-per-test-schema)
      // connection above, so they'd otherwise persist across runs.
      await sharedPrisma.unit.deleteMany({ where: { tenantId: t.id } });
      await sharedPrisma.batch.deleteMany({ where: { tenantId: t.id } });
      await sharedPrisma.oem.deleteMany({ where: { tenantId: t.id } });
      await sharedPrisma.product.deleteMany({ where: { tenantId: t.id } });
      await sharedPrisma.tenant.delete({ where: { id: t.id } });
    });

    it('400s a POST without the Idempotency-Key header', async () => {
      const t = await tenant(appPrisma);
      const p = await product(appPrisma, { tenantId: t.id });
      const o = await oem(appPrisma, { tenantId: t.id });
      const key = await fullAccessKey(t.id);

      const res = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${key}`)
        .send({ productId: p.id, oemId: o.id, count: 10 })
        .expect(400);
      expect(res.body.error.type).toBe('validation');
    });

    it('403s a read:batches-only key attempting to write', async () => {
      const t = await tenant(appPrisma);
      const p = await product(appPrisma, { tenantId: t.id });
      const o = await oem(appPrisma, { tenantId: t.id });
      const key = (
        await apiKeyService.create(t.id, {
          name: 'read-only',
          scopes: ['read:batches'],
          createdById: 'user-1',
        })
      ).key;

      const res = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${key}`)
        .set('Idempotency-Key', randomUUID())
        .send({ productId: p.id, oemId: o.id, count: 10 })
        .expect(403);
      expect(res.body.error.type).toBe('forbidden');
    });
  });

  describe('POST /api/v1/units/:id/{flag,decommission,restore}', () => {
    async function seedUnit(tenantId: string) {
      const p = await product(appPrisma, { tenantId });
      const b = await batch(appPrisma, { tenantId, productId: p.id });
      return unit(appPrisma, { tenantId, batchId: b.id, productId: p.id });
    }

    it('flags, decommissions, and restores a unit, each recorded in the audit log', async () => {
      const t = await tenant(appPrisma);
      const u = await seedUnit(t.id);
      const key = await fullAccessKey(t.id);

      const flagged = await request(app.getHttpServer())
        .post(`/api/v1/units/${u.id}/flag`)
        .set('Authorization', `Bearer ${key}`)
        .send({ reason: 'suspicious scan pattern' })
        .expect(201);
      expect(flagged.body.state).toBe('flagged');

      const decommissioned = await request(app.getHttpServer())
        .post(`/api/v1/units/${u.id}/decommission`)
        .set('Authorization', `Bearer ${key}`)
        .send({ reason: 'confirmed counterfeit' })
        .expect(201);
      expect(decommissioned.body.state).toBe('decommissioned');

      const restored = await request(app.getHttpServer())
        .post(`/api/v1/units/${u.id}/restore`)
        .set('Authorization', `Bearer ${key}`)
        .send({ reason: 'reinstated after review' })
        .expect(201);
      expect(restored.body.state).toBe('active');

      const auditRows = await appPrisma.auditLog.findMany({
        where: { tenantId: t.id, targetType: 'unit', targetId: u.id },
        orderBy: { seq: 'asc' },
      });
      expect(auditRows.map((r) => r.action)).toEqual([
        'unit.flag',
        'unit.decommission',
        'unit.restore',
      ]);
      expect(auditRows.every((r) => r.actorType === 'apikey')).toBe(true);
    });

    it('a read:units-only key gets 403 forbidden on write:units routes', async () => {
      const t = await tenant(appPrisma);
      const u = await seedUnit(t.id);
      const key = (
        await apiKeyService.create(t.id, {
          name: 'read-only',
          scopes: ['read:units'],
          createdById: 'user-1',
        })
      ).key;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/units/${u.id}/flag`)
        .set('Authorization', `Bearer ${key}`)
        .send({ reason: 'probe' })
        .expect(403);
      expect(res.body.error.type).toBe('forbidden');
    });

    it('404s (never 403) flagging a unit belonging to another tenant', async () => {
      const t1 = await tenant(appPrisma);
      const t2 = await tenant(appPrisma);
      const u1 = await seedUnit(t1.id);
      const keyT2 = await fullAccessKey(t2.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/units/${u1.id}/flag`)
        .set('Authorization', `Bearer ${keyT2}`)
        .send({ reason: 'cross-tenant probe' })
        .expect(404);
      expect(res.body.error.type).toBe('not_found');
    });

    it('400s a missing reason', async () => {
      const t = await tenant(appPrisma);
      const u = await seedUnit(t.id);
      const key = await fullAccessKey(t.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/units/${u.id}/flag`)
        .set('Authorization', `Bearer ${key}`)
        .send({})
        .expect(400);
      expect(res.body.error.type).toBe('validation');
    });
  });
});
