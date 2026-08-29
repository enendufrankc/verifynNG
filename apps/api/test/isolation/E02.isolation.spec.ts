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

describe('E02 isolation — members routes', () => {
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
    await app.init();
    appPrisma = app.get(PrismaClient);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await appPrisma.$disconnect();
    await dropTestSchema(schemaName, dbPrisma);
    await disconnectTestHelper();
  });

  it('never leaks tenant B data or state to tenant A, and returns 404 not 403', async () => {
    const routes: IsolationRoute[] = [
      {
        method: 'get',
        path: (b: TenantFixture) => `/tenants/${b.tenant.id}/members`,
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: (b: TenantFixture) => `/tenants/${b.tenant.id}/members/invite`,
        body: {
          email: `cross-tenant-${Date.now()}@isolation.test`,
          role: 'viewer',
        },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'patch',
        path: (b: TenantFixture) =>
          `/tenants/${b.tenant.id}/members/${b.viewer.user.id}`,
        body: { role: 'operator' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'delete',
        path: (b: TenantFixture) =>
          `/tenants/${b.tenant.id}/members/${b.viewer.user.id}`,
        expectWhenCrossTenant: 404,
      },
    ];

    await assertTenantIsolation(app, appPrisma, routes);
  });
});
