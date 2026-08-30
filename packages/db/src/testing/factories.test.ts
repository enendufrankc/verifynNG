import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  tenant,
  user,
  product,
  oem,
  batch,
  unit,
  scanEvent,
  resetFactoryCounter,
} from './factories';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '../test-helpers';

describe('factories', () => {
  let prisma: Awaited<ReturnType<typeof createTestDatabase>>['prisma'];
  let schemaName: string;
  let tenantId: string;

  beforeAll(async () => {
    const result = await createTestDatabase('factories-test');
    prisma = result.prisma;
    schemaName = result.schemaName;
    resetFactoryCounter();
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('tenant() creates a tenant with defaults', async () => {
    const t = await tenant(prisma);
    tenantId = t.id;
    expect(t.slug).toMatch(/^tenant_/);
    expect(t.status).toBe('active');
  });

  it('tenant() accepts overrides', async () => {
    const t = await tenant(prisma, { slug: 'custom-slug', name: 'Custom' });
    expect(t.slug).toBe('custom-slug');
    expect(t.name).toBe('Custom');
  });

  it('user() creates a user with defaults', async () => {
    const u = await user(prisma, { tenantId });
    expect(u.email).toMatch(/@test\.local$/);
    expect(u.tenantId).toBe(tenantId);
  });

  it('user() creates a user without tenant', async () => {
    const u = await user(prisma);
    expect(u.tenantId).toBeNull();
  });

  it('product() creates a product', async () => {
    const p = await product(prisma, { tenantId });
    expect(p.sku).toMatch(/^SKU/);
    expect(p.tenantId).toBe(tenantId);
  });

  it('oem() creates an OEM', async () => {
    const o = await oem(prisma, { tenantId, country: 'NG' });
    expect(o.country).toBe('NG');
    expect(o.tenantId).toBe(tenantId);
  });

  it('batch() creates a batch', async () => {
    const p = await product(prisma, { tenantId });
    const b = await batch(prisma, { tenantId, productId: p.id });
    expect(b.count).toBe(100);
    expect(b.status).toBe('minted');
  });

  it('unit() creates a unit', async () => {
    const p = await product(prisma, { tenantId });
    const b = await batch(prisma, { tenantId, productId: p.id });
    const u = await unit(prisma, { tenantId, batchId: b.id });
    expect(u.tier1Code).toMatch(/^VK1TEST/);
    expect(u.state).toBe('active');
  });

  it('scanEvent() creates a scan event', async () => {
    const se = await scanEvent(prisma, { tenantId });
    expect(se.tier).toBe('tier1');
    expect(se.verdict).toBe('authentic');
    expect(se.codeRedacted).toBeTruthy();
    expect(se.source).toBe('qr');
  });
});
