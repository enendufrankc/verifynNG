import crypto from 'node:crypto';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import {
  assertTenantIsolation,
  type IsolationRoute,
  type TenantFixture,
} from '@verifynng/db/testing';
import { AppModule } from '../../src/app.module';

describe('E07 isolation — units, batches, and anomalies routes', () => {
  let app: INestApplication;
  let dbPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let schemaName: string;
  let serial = 0;

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  /** Seeds a fresh product/batch/unit for `tenant` and returns the unit id. */
  async function seedUnit(
    tenant: TenantFixture,
  ): Promise<{ unitId: string; batchId: string }> {
    serial += 1;
    const product = await appPrisma.product.create({
      data: {
        tenantId: tenant.tenant.id,
        sku: `iso-sku-${serial}`,
        name: 'Isolation Product',
      },
    });
    const batch = await appPrisma.batch.create({
      data: {
        tenantId: tenant.tenant.id,
        productId: product.id,
        count: 1,
        status: 'shipped',
        idempotencyKey: `iso-batch-${serial}`,
        requestedBy: 'isolation-test',
        watermark: `ISO${serial}`,
        kid: 'k1',
      },
    });
    const unit = await appPrisma.unit.create({
      data: {
        tenantId: tenant.tenant.id,
        batchId: batch.id,
        productId: product.id,
        tier1Code: `isolation.1.k1.${serial}`,
        tier2Hash: `isolation.2.hash.${serial}`,
        serial,
      },
    });
    return { unitId: unit.id, batchId: batch.id };
  }

  /** Seeds a fresh open anomaly for `tenant`, on its own fresh unit. */
  async function seedAnomaly(tenant: TenantFixture): Promise<string> {
    const { unitId, batchId } = await seedUnit(tenant);
    const anomaly = await appPrisma.anomaly.create({
      data: {
        tenantId: tenant.tenant.id,
        rule: 'dead_code',
        unitId,
        batchId,
        score: 70,
        evidence: { scans: [], thresholds: {}, computed: {}, source: 'event' },
        dedupeKey: `isolation:${tenant.tenant.id}:${crypto.randomUUID()}`,
      },
    });
    return anomaly.id;
  }

  it('never leaks tenant B units, batches, or anomalies to tenant A, and returns 404 not 403', async () => {
    const routes: IsolationRoute[] = [
      {
        method: 'get',
        path: async (b) => `/v1/units/${(await seedUnit(b)).unitId}`,
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/units/${(await seedUnit(b)).unitId}/flag`,
        body: { reason: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) =>
          `/v1/units/${(await seedUnit(b)).unitId}/decommission`,
        body: { reason: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/units/${(await seedUnit(b)).unitId}/restore`,
        body: { reason: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/batches/${(await seedUnit(b)).batchId}/recall`,
        body: { reason: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'get',
        path: async (b) => `/v1/anomalies/${await seedAnomaly(b)}`,
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/anomalies/${await seedAnomaly(b)}/acknowledge`,
        body: { note: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/anomalies/${await seedAnomaly(b)}/resolve`,
        body: { note: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/anomalies/${await seedAnomaly(b)}/dismiss`,
        body: { note: 'cross-tenant probe' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/anomalies/${await seedAnomaly(b)}/assign`,
        body: { userId: 'does-not-matter' },
        expectWhenCrossTenant: 404,
      },
    ];

    await assertTenantIsolation(app, appPrisma, routes);
  });
});
