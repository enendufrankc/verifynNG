import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { ApiKeyService } from './api-key.service.js';
import type {
  EntitlementService,
  EntitlementLimits,
} from '../entitlements/entitlement.service.js';
import { hashApiKey, randomBase62 } from './key-generator.js';

function permissiveEntitlements(
  overrides: Partial<{ hasFeature: boolean; limits: EntitlementLimits }> = {},
): EntitlementService {
  return {
    async hasFeature() {
      return overrides.hasFeature ?? true;
    },
    async limitsFor() {
      return overrides.limits ?? { apiRateLimitPerMin: 120, maxApiKeys: 10 };
    },
  };
}

describe('ApiKeyService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  const runId = Date.now();

  beforeAll(async () => {
    const db = await createTestDatabase('api-key-service-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  it('creates a key: the raw key is only ever returned once, and is never persisted', async () => {
    const service = new ApiKeyService(
      prisma,
      new EventEmitter2(),
      permissiveEntitlements(),
    );
    const tenantId = `tenant-create-${runId}`;

    const { key, record } = await service.create(tenantId, {
      name: 'ERP',
      scopes: ['read:batches', 'write:batches'],
      createdById: 'user-1',
    });

    expect(key).toMatch(/^vk_live_[0-9A-Za-z]{32}$/);
    expect(record.prefix).toBe(key.slice(0, 12));
    expect((record as Record<string, unknown>).hash).toBeUndefined();

    const stored = await prisma.apiKey.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(stored.hash).toBe(hashApiKey(key));
    expect(stored.hash).not.toBe(key);
  });

  it('verify() accepts the exact key and rejects a tampered or unknown one', async () => {
    const service = new ApiKeyService(
      prisma,
      new EventEmitter2(),
      permissiveEntitlements(),
    );
    const tenantId = `tenant-verify-${runId}`;
    const { key } = await service.create(tenantId, {
      name: 'ERP',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    const verified = await service.verify(key);
    expect(verified).toEqual({
      keyId: expect.any(String),
      tenantId,
      scopes: ['read:batches'],
      mode: 'live',
      prefix: key.slice(0, 12),
    });

    const tampered = key.slice(0, -1) + (key.at(-1) === 'a' ? 'b' : 'a');
    await expect(service.verify(tampered)).resolves.toBeNull();
    await expect(
      service.verify(`vk_live_${randomBase62(32)}`),
    ).resolves.toBeNull();
    await expect(service.verify('not-a-key')).resolves.toBeNull();
  });

  it('revoke() invalidates the key for future verify() calls and cannot be repeated', async () => {
    const service = new ApiKeyService(
      prisma,
      new EventEmitter2(),
      permissiveEntitlements(),
    );
    const tenantId = `tenant-revoke-${runId}`;
    const { key, record } = await service.create(tenantId, {
      name: 'ERP',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    await service.revoke(tenantId, record.id, 'user-1');
    await expect(service.verify(key)).resolves.toBeNull();
    await expect(
      service.revoke(tenantId, record.id, 'user-1'),
    ).rejects.toThrow();
  });

  it('list() and get() never expose the hash', async () => {
    const service = new ApiKeyService(
      prisma,
      new EventEmitter2(),
      permissiveEntitlements(),
    );
    const tenantId = `tenant-list-${runId}`;
    const { record } = await service.create(tenantId, {
      name: 'ERP',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    const [listed] = await service.list(tenantId);
    const fetched = await service.get(tenantId, record.id);
    expect((listed as Record<string, unknown>).hash).toBeUndefined();
    expect((fetched as Record<string, unknown>).hash).toBeUndefined();
  });

  it('rejects creation with 402 plan_limit once maxApiKeys is reached', async () => {
    const service = new ApiKeyService(
      prisma,
      new EventEmitter2(),
      permissiveEntitlements({
        limits: { apiRateLimitPerMin: 120, maxApiKeys: 1 },
      }),
    );
    const tenantId = `tenant-limit-${runId}`;

    await service.create(tenantId, {
      name: 'first',
      scopes: ['read:batches'],
      createdById: 'user-1',
    });

    await expect(
      service.create(tenantId, {
        name: 'second',
        scopes: ['read:batches'],
        createdById: 'user-1',
      }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('rejects creation with 402 plan_limit when publicApi is not entitled', async () => {
    const service = new ApiKeyService(
      prisma,
      new EventEmitter2(),
      permissiveEntitlements({ hasFeature: false }),
    );
    const tenantId = `tenant-nofeature-${runId}`;

    await expect(
      service.create(tenantId, {
        name: 'first',
        scopes: ['read:batches'],
        createdById: 'user-1',
      }),
    ).rejects.toMatchObject({ status: 402 });
  });
});
