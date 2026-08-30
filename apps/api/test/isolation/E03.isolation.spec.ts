import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@verifynng/db';
import { AppModule } from '../../src/app.module';

// TODO(E03): rewrite on E02's tenant-isolation harness with real tokens; the header-based
// PrincipalGuard this spec drove was removed when E02's guards landed.
describe.skip('E03 tenant isolation and status-guard integration', () => {
  let app: INestApplication;
  const tenantAId = 'tenant-e03-isolation-a';
  const tenantBId = 'tenant-e03-isolation-b';

  beforeAll(async () => {
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

    await prisma.tenant.create({
      data: {
        id: tenantAId,
        slug: tenantAId,
        name: 'Isolation Tenant A',
        status: 'active',
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        slug: tenantBId,
        name: 'Isolation Tenant B',
        status: 'in_review',
      },
    });
  });

  afterAll(async () => {
    await prisma.tenantReviewNote.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('404s a GET against another tenant', async () => {
    await request(app.getHttpServer())
      .get(`/tenants/${tenantBId}`)
      .set('x-tenant-id', tenantAId)
      .set('x-role', 'owner')
      .expect(404);
  });

  it('404s a write against another tenant', async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantBId}/settings`)
      .set('x-tenant-id', tenantAId)
      .set('x-role', 'owner')
      .send({ name: 'hijacked' })
      .expect(404);
  });

  it('403s a support route for a non-support principal', async () => {
    await request(app.getHttpServer())
      .post(`/support/tenants/${tenantBId}/approve`)
      .set('x-platform-role', 'operator')
      .expect(403);
  });

  it('lets support approve an in_review tenant, then suspend and reactivate it', async () => {
    await request(app.getHttpServer())
      .post(`/support/tenants/${tenantBId}/approve`)
      .set('x-platform-role', 'support')
      .set('x-user-id', 'support-agent')
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('active');
      });

    await request(app.getHttpServer())
      .post(`/support/tenants/${tenantBId}/suspend`)
      .set('x-platform-role', 'support')
      .set('x-user-id', 'support-agent')
      .send({ reason: 'manual', note: 'isolation test' })
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('suspended');
      });

    await request(app.getHttpServer())
      .post(`/support/tenants/${tenantBId}/reactivate`)
      .set('x-platform-role', 'support')
      .set('x-user-id', 'support-agent')
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('active');
      });
  });
});
