import type {
  Prisma,
  Tenant,
  User,
  Product,
  Batch,
  Unit,
  ScanEvent,
  Oem,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/**
 * Factory helpers for creating test data.
 * Each factory returns a valid Prisma create input.
 * When a prisma client is provided, the factory persists the record.
 *
 * TODO(E01): factories for unit() and scanEvent() will use generateCode/hashForStorage
 * when E01 ships. Currently they accept pre-computed values.
 */

let _counter = 0;
function uniqueSlug(prefix: string): string {
  return `${prefix}_${++_counter}_${Date.now()}`;
}

export function resetFactoryCounter(): void {
  _counter = 0;
}

// ── Tenant ────────────────────────────────────────────────

export interface TenantOverrides
  extends Partial<Omit<Prisma.TenantCreateInput, 'id'>> {
  id?: string;
}

export async function tenant(
  prisma: PrismaClient,
  overrides: TenantOverrides = {},
): Promise<Tenant> {
  const slug = overrides.slug ?? uniqueSlug('tenant');
  return prisma.tenant.create({
    data: {
      id: overrides.id,
      slug,
      name: overrides.name ?? `Tenant ${slug}`,
      legalName: overrides.legalName ?? `Tenant ${slug} Ltd`,
      status: overrides.status ?? 'active',
    },
  });
}

// ── User ──────────────────────────────────────────────────

export interface UserOverrides
  extends Partial<Omit<Prisma.UserCreateInput, 'id'>> {
  id?: string;
  tenantId?: string | null;
}

export async function user(
  prisma: PrismaClient,
  overrides: UserOverrides = {},
): Promise<User> {
  const email = overrides.email ?? `user_${++_counter}@test.local`;
  return prisma.user.create({
    data: {
      id: overrides.id,
      email,
      passwordHash: overrides.passwordHash ?? '$2b$10$FAKEHASH',
      displayName: overrides.displayName ?? `User ${_counter}`,
      tenantId: overrides.tenantId ?? undefined,
    },
  });
}

// ── Product ───────────────────────────────────────────────

export interface ProductOverrides
  extends Partial<Omit<Prisma.ProductCreateInput, 'id' | 'tenant'>> {
  id?: string;
  tenantId: string;
}

export async function product(
  prisma: PrismaClient,
  overrides: ProductOverrides,
): Promise<Product> {
  const sku = overrides.sku ?? `SKU${++_counter}`;
  return prisma.product.create({
    data: {
      id: overrides.id,
      tenantId: overrides.tenantId,
      sku,
      name: overrides.name ?? `Product ${sku}`,
      gtin: overrides.gtin,
    },
  });
}

// ── Oem ───────────────────────────────────────────────────

export interface OemOverrides
  extends Partial<Omit<Prisma.OemCreateInput, 'id' | 'tenant'>> {
  id?: string;
  tenantId: string;
}

export async function oem(
  prisma: PrismaClient,
  overrides: OemOverrides,
): Promise<Oem> {
  return prisma.oem.create({
    data: {
      id: overrides.id,
      tenantId: overrides.tenantId,
      name: overrides.name ?? `OEM ${++_counter}`,
      country: overrides.country,
    },
  });
}

// ── Batch ─────────────────────────────────────────────────

export interface BatchOverrides
  extends Partial<
    Omit<Prisma.BatchCreateInput, 'id' | 'tenant' | 'product' | 'oem'>
  > {
  id?: string;
  tenantId: string;
  productId: string;
  oemId?: string;
}

export async function batch(
  prisma: PrismaClient,
  overrides: BatchOverrides,
): Promise<Batch> {
  return prisma.batch.create({
    data: {
      id: overrides.id,
      tenantId: overrides.tenantId,
      productId: overrides.productId,
      oemId: overrides.oemId,
      count: overrides.count ?? 100,
      status: overrides.status ?? 'minted',
      idempotencyKey:
        overrides.idempotencyKey ?? `factory-${uniqueSlug('batch')}`,
      requestedBy: overrides.requestedBy ?? 'factory-user',
      watermark: overrides.watermark ?? 'TEST',
      kid: overrides.kid ?? 'k1',
    },
  });
}

// ── Unit ──────────────────────────────────────────────────

export interface UnitOverrides
  extends Partial<Omit<Prisma.UnitCreateInput, 'id' | 'tenant' | 'batch'>> {
  id?: string;
  tenantId: string;
  batchId: string;
}

export async function unit(
  prisma: PrismaClient,
  overrides: UnitOverrides,
): Promise<Unit> {
  // TODO(E01): use generateCode/hashForStorage from @verifynng/core for tier1Code/tier2Hash
  const idx = ++_counter;
  return prisma.unit.create({
    data: {
      id: overrides.id,
      tenantId: overrides.tenantId,
      batchId: overrides.batchId,
      serial: overrides.serial ?? idx,
      productId: overrides.productId ?? 'factory-product',
      tier1Code:
        overrides.tier1Code ?? `VK1TEST${String(idx).padStart(8, '0')}`,
      tier2Hash: overrides.tier2Hash ?? idx.toString(16).padStart(64, '0'),
      state: overrides.state ?? 'active',
    },
  });
}

// ── ScanEvent ─────────────────────────────────────────────

export interface ScanEventOverrides
  extends Partial<Omit<Prisma.ScanEventCreateInput, 'id' | 'tenant' | 'unit'>> {
  id?: string;
  tenantId: string;
  unitId?: string | null;
}

export async function scanEvent(
  prisma: PrismaClient,
  overrides: ScanEventOverrides,
): Promise<ScanEvent> {
  const idx = ++_counter;
  return prisma.scanEvent.create({
    data: {
      id: overrides.id,
      tenantId: overrides.tenantId,
      unitId: overrides.unitId ?? undefined,
      tier: overrides.tier ?? 'tier1',
      verdict: overrides.verdict ?? 'authentic',
      source: overrides.source ?? 'qr',
      codeRedacted:
        overrides.codeRedacted ?? `ig.1.K1.${String(idx).padStart(4, '0')}…`,
      ipHash: overrides.ipHash,
      ipPrefix: overrides.ipPrefix,
      geoCountry: overrides.geoCountry ?? 'NG',
      geoRegion: overrides.geoRegion,
      geoCity: overrides.geoCity ?? 'Lagos',
      deviceClass: overrides.deviceClass ?? 'unknown',
      userAgent: overrides.userAgent ?? 'TestAgent/1.0',
    },
  });
}
