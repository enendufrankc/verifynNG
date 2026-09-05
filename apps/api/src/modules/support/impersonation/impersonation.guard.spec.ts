import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { PLATFORM_ROLE_KEY } from '../../auth/decorators/platform-role.decorator';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ImpersonationGuard } from './impersonation.guard';
import type { ImpersonationService } from './impersonation.service';

function makeContext(opts: {
  method: string;
  user?: { userId: string; platformRole?: string };
  tenantId?: string;
  metadata?: Record<string, unknown>;
}): ExecutionContext {
  const req: Record<string, unknown> = {
    method: opts.method,
    user: opts.user,
    tenantId: opts.tenantId,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({ __meta: opts.metadata }),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: Record<string, unknown> = {}): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

describe('ImpersonationGuard', () => {
  const supportUser = { userId: 'support-1', platformRole: 'support' };

  it('allows a GET even with no active impersonation session', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn().mockResolvedValue(null),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(makeReflector(), impersonationService);

    const ctx = makeContext({
      method: 'GET',
      user: supportUser,
      tenantId: 'tenant-1',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('blocks a non-GET with no active session', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn().mockResolvedValue(null),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(makeReflector(), impersonationService);

    const ctx = makeContext({
      method: 'POST',
      user: supportUser,
      tenantId: 'tenant-1',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('blocks a non-GET on a read-mode session', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn().mockResolvedValue({
        id: 'sess-1',
        supportUserId: 'support-1',
        supportEmail: 'support@verifyng.local',
        tenantId: 'tenant-1',
        mode: 'read',
      }),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(makeReflector(), impersonationService);

    const ctx = makeContext({
      method: 'POST',
      user: supportUser,
      tenantId: 'tenant-1',
    });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { error: 'impersonation_read_only' },
    });
  });

  it('allows a non-GET on a write-mode session for an operator-level route', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn().mockResolvedValue({
        id: 'sess-1',
        supportUserId: 'support-1',
        supportEmail: 'support@verifyng.local',
        tenantId: 'tenant-1',
        mode: 'write',
      }),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(
      makeReflector({ [ROLES_KEY]: ['operator'] }),
      impersonationService,
    );

    const ctx = makeContext({
      method: 'POST',
      user: supportUser,
      tenantId: 'tenant-1',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('never grants owner: blocks a write-mode session on an owner-only route', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn().mockResolvedValue({
        id: 'sess-1',
        supportUserId: 'support-1',
        supportEmail: 'support@verifyng.local',
        tenantId: 'tenant-1',
        mode: 'write',
      }),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(
      makeReflector({ [ROLES_KEY]: ['owner'] }),
      impersonationService,
    );

    const ctx = makeContext({
      method: 'POST',
      user: supportUser,
      tenantId: 'tenant-1',
    });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { error: 'impersonation_owner_only' },
    });
  });

  it('never checks impersonation for a @PlatformRole route', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn(),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(
      makeReflector({ [PLATFORM_ROLE_KEY]: 'support' }),
      impersonationService,
    );

    const ctx = makeContext({ method: 'POST', user: supportUser });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(impersonationService.resolveActiveFor).not.toHaveBeenCalled();
  });

  it('never checks impersonation for a @Public route', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn(),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(
      makeReflector({ [IS_PUBLIC_KEY]: true }),
      impersonationService,
    );

    const ctx = makeContext({ method: 'POST' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(impersonationService.resolveActiveFor).not.toHaveBeenCalled();
  });

  it('leaves a non-support principal alone entirely', async () => {
    const impersonationService = {
      resolveActiveFor: vi.fn(),
    } as unknown as ImpersonationService;
    const guard = new ImpersonationGuard(makeReflector(), impersonationService);

    const ctx = makeContext({
      method: 'POST',
      user: { userId: 'owner-1' },
      tenantId: 'tenant-1',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(impersonationService.resolveActiveFor).not.toHaveBeenCalled();
  });
});
