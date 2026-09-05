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
import { ApiKeyService } from '../../src/modules/api-keys/api-key.service';

// example.com is a real, IANA-reserved-for-documentation domain — resolves
// over real DNS to a public address, so these tests exercise the SSRF
// guard's happy path without needing WEBHOOKS_ALLOW_PRIVATE at test time
// (unit coverage for the guard itself, including the private/loopback
// rejection paths, lives in webhook-url-validator.spec.ts).
const SAFE_URL = 'https://example.com/webhooks/erp';

describe('Webhook endpoints (integration)', () => {
  let app: INestApplication;
  let dbPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let schemaName: string;
  let apiKeyService: ApiKeyService;
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
    apiKeyService = app.get(ApiKeyService);
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

  /**
   * Uses the shared cross-epic harness — a real Session row + a JWT signed
   * exactly as TokenService.issueAccessToken produces. TenantStatusGuard
   * (apps/api/src/common/tenant-status/tenant-status.guard.ts, global,
   * every `/tenants/:tenantId/**` console route) is — like MintService in
   * T5 — wired to @verifynng/db's shared 'prisma' singleton rather than the
   * PrismaClient class token, so it can't see a tenant created only in this
   * test's isolated schema. Mirror the tenant into that shared connection
   * too, same workaround as write-endpoints.integration.spec.ts (T5).
   */
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

  describe('console routes (/tenants/:tenantId/webhook-endpoints)', () => {
    it('creates, lists, gets, updates, and tests an endpoint as owner', async () => {
      const { tenantId, auth } = await ownerFixture();

      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/webhook-endpoints`)
        .set('Authorization', auth)
        .send({ url: SAFE_URL, events: ['unit.flagged'], description: 'ERP' })
        .expect(201);
      expect(created.body.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
      expect(created.body.endpoint.url).toBe(SAFE_URL);
      expect(created.body.endpoint).not.toHaveProperty('secretEnc');

      const id = created.body.endpoint.id;

      const listed = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/webhook-endpoints`)
        .set('Authorization', auth)
        .expect(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).not.toHaveProperty('secretEnc');

      const fetched = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/webhook-endpoints/${id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(fetched.body.id).toBe(id);

      const updated = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/webhook-endpoints/${id}`)
        .set('Authorization', auth)
        .send({ description: 'ERP v2' })
        .expect(200);
      expect(updated.body.description).toBe('ERP v2');

      const tested = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/webhook-endpoints/${id}/test`)
        .set('Authorization', auth)
        .expect(201);
      expect(tested.body.deliveryId).toBeTruthy();

      const delivery = await appPrisma.webhookDelivery.findUnique({
        where: { id: tested.body.deliveryId },
      });
      expect(delivery?.event).toBe('ping');

      const rotated = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/webhook-endpoints/${id}/rotate-secret`)
        .set('Authorization', auth)
        .expect(201);
      expect(rotated.body.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
      expect(rotated.body.secret).not.toBe(created.body.secret);

      const disabled = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/webhook-endpoints/${id}`)
        .set('Authorization', auth)
        .send({ status: 'disabled' })
        .expect(200);
      expect(disabled.body.status).toBe('disabled');
    });

    it('rejects an insecure/private URL', async () => {
      const { tenantId, auth } = await ownerFixture();

      const res = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/webhook-endpoints`)
        .set('Authorization', auth)
        .send({ url: 'https://127.0.0.1/hook', events: ['unit.flagged'] });
      expect(res.status).toBe(400);
    });

    it('rejects an invalid event selection', async () => {
      const { tenantId, auth } = await ownerFixture();

      const res = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/webhook-endpoints`)
        .set('Authorization', auth)
        .send({ url: SAFE_URL, events: ['not.a.real.event'] });
      expect(res.status).toBe(400);
    });
  });

  describe('public API routes (/api/v1/webhook-endpoints)', () => {
    async function fullAccessKey(tenantId: string) {
      return (
        await apiKeyService.create(tenantId, {
          name: 'full',
          scopes: ['write:batches'],
          createdById: 'user-1',
        })
      ).key;
    }

    it('creates, lists, and deletes an endpoint via the public API', async () => {
      const t = await tenant(appPrisma);
      const key = await fullAccessKey(t.id);

      const created = await request(app.getHttpServer())
        .post('/api/v1/webhook-endpoints')
        .set('Authorization', `Bearer ${key}`)
        .send({ url: SAFE_URL, events: ['*'] })
        .expect(201);
      const id = created.body.endpoint.id;

      const listed = await request(app.getHttpServer())
        .get('/api/v1/webhook-endpoints')
        .set('Authorization', `Bearer ${key}`)
        .expect(200);
      expect(listed.body.map((e: { id: string }) => e.id)).toContain(id);

      await request(app.getHttpServer())
        .delete(`/api/v1/webhook-endpoints/${id}`)
        .set('Authorization', `Bearer ${key}`)
        .expect(200);

      const afterDelete = await appPrisma.webhookEndpoint.findUnique({
        where: { id },
      });
      expect(afterDelete).toBeNull();
    });

    it('403s a read-only-scoped key attempting to create', async () => {
      const t = await tenant(appPrisma);
      const key = (
        await apiKeyService.create(t.id, {
          name: 'read-only',
          scopes: ['read:batches'],
          createdById: 'user-1',
        })
      ).key;

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhook-endpoints')
        .set('Authorization', `Bearer ${key}`)
        .send({ url: SAFE_URL, events: ['*'] })
        .expect(403);
      expect(res.body.error.type).toBe('forbidden');
    });
  });
});
