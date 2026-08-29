import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@verifynng/db';
import { TenantStatusGuard } from './tenant-status.guard';

vi.mock('@verifynng/db', () => ({
  prisma: {
    tenant: { findFirst: vi.fn() },
    policyDocument: { findMany: vi.fn() },
    policyAcceptance: { findMany: vi.fn() },
  },
}));

const db = prisma as unknown as {
  tenant: { findFirst: ReturnType<typeof vi.fn> };
  policyDocument: { findMany: ReturnType<typeof vi.fn> };
  policyAcceptance: { findMany: ReturnType<typeof vi.fn> };
};

function executionContext(
  request: Record<string, unknown>,
  metadata?: string[],
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Handler {},
    metadata,
  } as never;
}

function guardWithMetadata(metadata?: string[]) {
  return new TenantStatusGuard({
    get: vi.fn((key: string) => (key === 'tenant-status' ? metadata : false)),
  } as never);
}

describe('TenantStatusGuard policy bump enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects the newest version and scopes acceptance to the authenticated user', async () => {
    db.tenant.findFirst.mockResolvedValue({ status: 'active' });
    db.policyDocument.findMany.mockResolvedValue([
      { kind: 'tos', version: '2026-09-01' },
      { kind: 'tos', version: '2026-08-01' },
      { kind: 'aup', version: '2026-08-01' },
    ]);
    db.policyAcceptance.findMany.mockResolvedValue([
      { kind: 'tos', version: '2026-09-01' },
    ]);
    const request = {
      path: '/tenants/tenant-a/settings',
      params: { tenantId: 'tenant-a' },
      method: 'PATCH',
      principal: { userId: 'user-a', role: 'owner', tenantId: 'tenant-a' },
    };

    await expect(
      new TenantStatusGuard({
        get: vi.fn(() => undefined),
      } as never).canActivate(executionContext(request)),
    ).rejects.toMatchObject({
      response: { error: 'policy_acceptance_required', pending: ['aup'] },
    });
    expect(db.policyAcceptance.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', userId: 'user-a' },
      select: { kind: true, version: true },
    });
  });

  it('returns the exact policy-required forbidden payload', async () => {
    db.tenant.findFirst.mockResolvedValue({ status: 'active' });
    db.policyDocument.findMany.mockResolvedValue([
      { kind: 'tos', version: '2026-09-01' },
    ]);
    db.policyAcceptance.findMany.mockResolvedValue([]);
    const request = {
      path: '/tenants/tenant-a/offboard',
      params: { tenantId: 'tenant-a' },
      method: 'POST',
      principal: { userId: 'user-a', role: 'owner', tenantId: 'tenant-a' },
    };

    try {
      await guardWithMetadata().canActivate(executionContext(request));
      throw new Error('expected policy gate');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
      expect((error as ForbiddenException).getResponse()).toEqual({
        error: 'policy_acceptance_required',
        pending: ['tos'],
      });
    }
  });

  it('preserves tenant status errors before evaluating policy acceptance', async () => {
    db.tenant.findFirst.mockResolvedValue({ status: 'pending' });
    const request = {
      path: '/tenants/tenant-a/settings',
      params: { tenantId: 'tenant-a' },
      method: 'PATCH',
      principal: { userId: 'user-a', role: 'owner', tenantId: 'tenant-a' },
    };

    await expect(
      guardWithMetadata().canActivate(executionContext(request)),
    ).rejects.toMatchObject({
      response: { error: 'tenant_not_active' },
    });
    expect(db.policyDocument.findMany).not.toHaveBeenCalled();
    expect(db.policyAcceptance.findMany).not.toHaveBeenCalled();
  });

  it.each(['viewer', 'operator'])(
    'bypasses policy gating for %s requests',
    async (role) => {
      db.tenant.findFirst.mockResolvedValue({ status: 'active' });
      const request = {
        path: '/tenants/tenant-a/settings',
        params: { tenantId: 'tenant-a' },
        method: 'PATCH',
        principal: { userId: 'user-a', role, tenantId: 'tenant-a' },
      };

      await expect(
        guardWithMetadata().canActivate(executionContext(request)),
      ).resolves.toBe(true);
      expect(db.policyDocument.findMany).not.toHaveBeenCalled();
      expect(db.policyAcceptance.findMany).not.toHaveBeenCalled();
    },
  );

  it('exempts owner GET requests from policy gating', async () => {
    db.tenant.findFirst.mockResolvedValue({ status: 'active' });
    const request = {
      path: '/tenants/tenant-a/policies',
      params: { tenantId: 'tenant-a' },
      method: 'GET',
      principal: { userId: 'user-a', role: 'owner', tenantId: 'tenant-a' },
    };

    await expect(
      guardWithMetadata().canActivate(executionContext(request)),
    ).resolves.toBe(true);
    expect(db.policyDocument.findMany).not.toHaveBeenCalled();
    expect(db.policyAcceptance.findMany).not.toHaveBeenCalled();
  });

  it('exempts the owner policy acceptance route while policies are pending', async () => {
    db.tenant.findFirst.mockResolvedValue({ status: 'active' });
    const request = {
      path: '/tenants/tenant-a/policies/accept',
      params: { tenantId: 'tenant-a' },
      method: 'POST',
      principal: { userId: 'user-a', role: 'owner', tenantId: 'tenant-a' },
    };

    await expect(
      guardWithMetadata().canActivate(executionContext(request)),
    ).resolves.toBe(true);
    expect(db.policyDocument.findMany).not.toHaveBeenCalled();
    expect(db.policyAcceptance.findMany).not.toHaveBeenCalled();
  });

  it('allows an owner write when every current policy is accepted', async () => {
    db.tenant.findFirst.mockResolvedValue({ status: 'active' });
    db.policyDocument.findMany.mockResolvedValue([
      { kind: 'tos', version: 'policy-b' },
      { kind: 'tos', version: 'policy-a' },
      { kind: 'aup', version: 'policy-a' },
    ]);
    db.policyAcceptance.findMany.mockResolvedValue([
      { kind: 'tos', version: 'policy-b' },
      { kind: 'aup', version: 'policy-a' },
    ]);
    const request = {
      path: '/tenants/tenant-a/settings',
      params: { tenantId: 'tenant-a' },
      method: 'PATCH',
      principal: { userId: 'user-a', role: 'owner', tenantId: 'tenant-a' },
    };

    await expect(
      guardWithMetadata().canActivate(executionContext(request)),
    ).resolves.toBe(true);
  });
});
