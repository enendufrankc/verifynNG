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

describe('E10 isolation — product pages routes', () => {
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

  /** Seeds a fresh draft product page for `tenant` and returns its id. */
  async function seedPage(tenant: TenantFixture): Promise<string> {
    serial += 1;
    const product = await appPrisma.product.create({
      data: {
        tenantId: tenant.tenant.id,
        sku: `iso-sku-${serial}`,
        name: 'Isolation Product',
      },
    });
    const page = await appPrisma.productPage.create({
      data: {
        tenantId: tenant.tenant.id,
        productId: product.id,
        slug: `iso-page-${serial}`,
        draftTheme: {},
        draftBlocks: [],
        draftSeo: {},
        createdById: tenant.owner.user.id,
      },
    });
    return page.id;
  }

  it('never leaks tenant B product pages to tenant A, and returns 404 not 403', async () => {
    const routes: IsolationRoute[] = [
      {
        method: 'get',
        path: async (b) => `/v1/product-pages/${await seedPage(b)}`,
        expectWhenCrossTenant: 404,
      },
      {
        method: 'get',
        path: async (b) => `/v1/product-pages/${await seedPage(b)}/versions`,
        expectWhenCrossTenant: 404,
      },
      {
        method: 'put',
        path: async (b) => `/v1/product-pages/${await seedPage(b)}/draft`,
        body: { theme: {}, blocks: [], seo: {} },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/product-pages/${await seedPage(b)}/publish`,
        body: {},
        expectWhenCrossTenant: 404,
      },
      {
        method: 'post',
        path: async (b) => `/v1/product-pages/${await seedPage(b)}/rollback`,
        body: { versionId: 'does-not-matter' },
        expectWhenCrossTenant: 404,
      },
      {
        method: 'delete',
        path: async (b) => `/v1/product-pages/${await seedPage(b)}`,
        expectWhenCrossTenant: 404,
      },
    ];

    await assertTenantIsolation(app, appPrisma, routes);
  });
});
