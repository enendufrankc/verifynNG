import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  prisma as sharedPrisma,
} from '@verifynng/db';
import { tenant, createTwoTenants } from '@verifynng/db/testing';
import { AppModule } from '../../src/app.module';

describe('Webhook deliveries (console, integration)', () => {
  let app: INestApplication;
  let dbPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let schemaName: string;
  const sharedTenantIds: string[] = [];

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
    await app.init();
    appPrisma = app.get(PrismaClient);
  }, 60_000);

  afterAll(async () => {
    await sharedPrisma.tenant.deleteMany({
      where: { id: { in: sharedTenantIds } },
    });
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  // TenantStatusGuard is wired to @verifynng/db's shared 'prisma' singleton
  // rather than the PrismaClient class token — see T5/T9 for the same
  // workaround (webhook-endpoints.integration.spec.ts's ownerFixture).
  async function ownerFixture() {
    const { a } = await createTwoTenants(appPrisma);
    await tenant(sharedPrisma as unknown as PrismaClient, {
      id: a.tenant.id,
      slug: a.tenant.slug,
    });
    sharedTenantIds.push(a.tenant.id);
    // The guard's policy-acceptance check also runs on the shared prisma
    // connection, and the E03/E19 migrations seed AUP/ToS PolicyDocument rows
    // into every database — mirror the owner's acceptances alongside the
    // tenant mirror above, or every owner write 403s policy_acceptance_required.
    const policyDocs = await sharedPrisma.policyDocument.findMany({
      where: { kind: { in: ['aup', 'tos'] }, effectiveFrom: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    const latestByKind = new Map<string, (typeof policyDocs)[number]>();
    for (const d of policyDocs)
      if (!latestByKind.has(d.kind)) latestByKind.set(d.kind, d);
    for (const d of latestByKind.values())
      await sharedPrisma.policyAcceptance.create({
        data: {
          tenantId: a.tenant.id,
          userId: a.owner.user.id,
          kind: d.kind,
          version: d.version,
        },
      });
    return { tenantId: a.tenant.id, auth: `Bearer ${a.owner.accessToken}` };
  }

  it('lists deliveries filtered by status and redelivers a dead one', async () => {
    const { tenantId, auth } = await ownerFixture();

    const endpoint = await appPrisma.webhookEndpoint.create({
      data: {
        tenantId,
        url: 'https://example.com/hook',
        events: ['unit.flagged'],
        secretEnc: 'irrelevant-for-this-test',
      },
    });

    const dead = await appPrisma.webhookDelivery.create({
      data: {
        tenantId,
        endpointId: endpoint.id,
        event: 'unit.flagged',
        payload: { unitId: 'u1' },
        status: 'dead',
        attempts: 10,
        lastStatusCode: 500,
      },
    });
    await appPrisma.webhookDelivery.create({
      data: {
        tenantId,
        endpointId: endpoint.id,
        event: 'unit.flagged',
        payload: { unitId: 'u2' },
        status: 'succeeded',
        attempts: 1,
        lastStatusCode: 200,
      },
    });

    const listed = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/webhook-deliveries`)
      .query({ status: 'dead' })
      .set('Authorization', auth)
      .expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(dead.id);
    expect(listed.body.data[0]).not.toHaveProperty('payload');

    const all = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/webhook-deliveries`)
      .set('Authorization', auth)
      .expect(200);
    expect(all.body.data).toHaveLength(2);

    const redelivered = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/webhook-deliveries/${dead.id}/redeliver`)
      .set('Authorization', auth)
      .expect(201);
    expect(redelivered.body.deliveryId).toBe(dead.id);

    const reset = await appPrisma.webhookDelivery.findUnique({
      where: { id: dead.id },
    });
    expect(reset?.status).toBe('pending');
    expect(reset?.attempts).toBe(0);
  });

  it('404s redelivering a delivery from another tenant', async () => {
    const { tenantId: t1, auth: auth1 } = await ownerFixture();
    const { tenantId: t2 } = await ownerFixture();

    const endpoint = await appPrisma.webhookEndpoint.create({
      data: {
        tenantId: t2,
        url: 'https://example.com/hook',
        events: ['unit.flagged'],
        secretEnc: 'irrelevant-for-this-test',
      },
    });
    const delivery = await appPrisma.webhookDelivery.create({
      data: {
        tenantId: t2,
        endpointId: endpoint.id,
        event: 'unit.flagged',
        payload: {},
        status: 'dead',
      },
    });

    await request(app.getHttpServer())
      .post(`/tenants/${t1}/webhook-deliveries/${delivery.id}/redeliver`)
      .set('Authorization', auth1)
      .expect(404);
  });
});
