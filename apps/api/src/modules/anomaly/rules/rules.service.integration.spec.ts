import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { RulesService } from './rules.service';

describe('RulesService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;
  let service: RulesService;

  beforeAll(async () => {
    const result = await createTestDatabase('rules-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    const tenant = await prisma.tenant.create({
      data: { slug: 'rules-tenant', name: 'Rules Tenant' },
    });
    tenantId = tenant.id;
    service = new RulesService(prisma);
    service.onModuleInit();
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('returns bundled defaults with no tenant overrides', async () => {
    const effective = await service.effective(tenantId);
    expect(effective.geo_dispersion).toEqual({
      enabled: true,
      thresholds: { distinctCities: 3, windowDays: 7 },
      score: 60,
      autoFlagAt: 60,
    });
  });

  it('merges a tenant threshold override over the defaults', async () => {
    await service.update(tenantId, {
      geo_dispersion: { thresholds: { distinctCities: 5 } },
    });
    const effective = await service.effective(tenantId);
    expect(effective.geo_dispersion.thresholds).toEqual({
      distinctCities: 5,
      windowDays: 7,
    });
    expect(effective.geo_dispersion.enabled).toBe(true);
  });

  it('can disable a rule without touching its thresholds', async () => {
    await service.update(tenantId, { velocity: { enabled: false } });
    const effective = await service.effective(tenantId);
    expect(effective.velocity.enabled).toBe(false);
    expect(effective.velocity.thresholds).toEqual({
      distinctUnits: 25,
      windowMinutes: 10,
    });
  });

  it('does not leak overrides across tenants', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { slug: 'rules-tenant-b', name: 'Rules Tenant B' },
    });
    const effective = await service.effective(otherTenant.id);
    expect(effective.geo_dispersion.thresholds).toEqual({
      distinctCities: 3,
      windowDays: 7,
    });
  });
});
