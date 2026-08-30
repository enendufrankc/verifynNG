import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';
import { TenantContextGuard } from '../../src/modules/auth/guards/tenant-context.guard';
import type { TokenService } from '../../src/modules/auth/services/token.service';
import type { DecodedToken } from '../../src/modules/auth/services/token.service';
import { Public } from '../../src/modules/auth/decorators/public.decorator';
import { Roles } from '../../src/modules/auth/decorators/roles.decorator';
import { PlatformRole } from '../../src/modules/auth/decorators/platform-role.decorator';
import { InternalOnly } from '../../src/modules/auth/decorators/internal-only.decorator';

// Dummy controllers carrying the real decorators, so the real Reflector
// reads real metadata — the same path production routes go through.
class PublicController {
  @Public()
  publicRoute() {}
}
class InternalController {
  @InternalOnly('jobs')
  internalRoute() {}
}
class PlatformController {
  @PlatformRole('support')
  supportRoute() {}
}
class RolesController {
  @Roles('owner')
  ownerOnly() {}

  @Roles('viewer')
  viewerOnly() {}

  @Roles('operator')
  operatorOnly() {}

  plainRoute() {}
}

function createContext(
  handler: (...args: unknown[]) => unknown,
  cls: new (...args: unknown[]) => unknown,
  request: Record<string, unknown>,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows @Public() routes unconditionally', () => {
    const ctx = createContext(
      PublicController.prototype.publicRoute,
      PublicController,
      {},
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows @InternalOnly() routes through (delegated to InternalOnlyGuard)', () => {
    const ctx = createContext(
      InternalController.prototype.internalRoute,
      InternalController,
      {},
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows a @PlatformRole route when the user has that platform role', () => {
    const ctx = createContext(
      PlatformController.prototype.supportRoute,
      PlatformController,
      { user: { platformRole: 'support' } },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids a @PlatformRole route when the user lacks that platform role', () => {
    const ctx = createContext(
      PlatformController.prototype.supportRoute,
      PlatformController,
      { user: { role: 'owner' } },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows a route with no @Roles() decorator for any authenticated user', () => {
    const ctx = createContext(
      RolesController.prototype.plainRoute,
      RolesController,
      { user: { role: 'viewer' } },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it.each([
    ['owner', 'ownerOnly', true],
    ['operator', 'ownerOnly', false],
    ['viewer', 'ownerOnly', false],
    ['owner', 'operatorOnly', true],
    ['operator', 'operatorOnly', true],
    ['viewer', 'operatorOnly', false],
    ['owner', 'viewerOnly', true],
    ['operator', 'viewerOnly', true],
    ['viewer', 'viewerOnly', true],
  ] as const)(
    'role %s on @Roles(...) route %s -> allowed=%s',
    (role, method, allowed) => {
      const ctx = createContext(
        (RolesController.prototype as unknown as Record<string, () => void>)[
          method
        ],
        RolesController,
        { user: { role } },
      );
      if (allowed) {
        expect(guard.canActivate(ctx)).toBe(true);
      } else {
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    },
  );

  it('denies a @Roles() route when there is no user on the request', () => {
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      {},
    );
    expect(guard.canActivate(ctx)).toBe(false);
  });
});

describe('TenantContextGuard', () => {
  function createGuard(decodedByToken: Record<string, DecodedToken>) {
    const fakeTokenService = {
      verifyAccessToken: vi.fn((token: string) => {
        const decoded = decodedByToken[token];
        if (!decoded) throw new Error('invalid token');
        return decoded;
      }),
      isSessionRevoked: vi.fn(async () => false),
    } as unknown as TokenService;
    const eventEmitter = new EventEmitter2();
    return {
      guard: new TenantContextGuard(
        new Reflector(),
        fakeTokenService,
        eventEmitter,
      ),
      fakeTokenService,
      eventEmitter,
    };
  }

  const baseDecoded: DecodedToken = {
    sub: 'user-1',
    tid: 'tenant-a',
    role: 'owner',
    sid: 'session-1',
    kid: 'k1',
    iat: 0,
    exp: 9999999999,
  };

  it('allows @Public() routes without an Authorization header', async () => {
    const { guard } = createGuard({});
    const ctx = createContext(
      PublicController.prototype.publicRoute,
      PublicController,
      {
        headers: {},
      },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows @InternalOnly() routes through (delegated to InternalOnlyGuard)', async () => {
    const { guard } = createGuard({});
    const ctx = createContext(
      InternalController.prototype.internalRoute,
      InternalController,
      { headers: {} },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a protected route with no Authorization header', async () => {
    const { guard } = createGuard({});
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      {
        headers: {},
      },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('rejects an ApiClient bearer token on a non-@InternalOnly route', async () => {
    const { guard } = createGuard({});
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      {
        headers: { authorization: 'Bearer vk_abcd_secret' },
      },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('sets request.user and request.tenantId from a valid token', async () => {
    const { guard } = createGuard({ 'good-token': baseDecoded });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
      params: {},
    };
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      request,
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-a',
      role: 'owner',
      sessionId: 'session-1',
    });
    expect(request.tenantId).toBe('tenant-a');
  });

  it('rejects when the session has been revoked', async () => {
    const { guard, fakeTokenService } = createGuard({
      'good-token': baseDecoded,
    });
    (
      fakeTokenService.isSessionRevoked as ReturnType<typeof vi.fn>
    ).mockResolvedValue(true);
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      {
        headers: { authorization: 'Bearer good-token' },
        params: {},
      },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('404s when the route :tenantId does not match the token tenant', async () => {
    const { guard } = createGuard({ 'good-token': baseDecoded });
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      {
        headers: { authorization: 'Bearer good-token' },
        params: { tenantId: 'tenant-b' },
      },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('lets a @PlatformRole route use the route :tenantId as authoritative', async () => {
    const { guard } = createGuard({ 'good-token': baseDecoded });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
      params: { tenantId: 'tenant-b' },
    };
    const ctx = createContext(
      PlatformController.prototype.supportRoute,
      PlatformController,
      request,
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-b');
  });

  it('lets a platformRole=support principal access any :tenantId and emits support.tenant.accessed', async () => {
    const supportDecoded: DecodedToken = { ...baseDecoded, prole: 'support' };
    const { guard, eventEmitter } = createGuard({
      'support-token': supportDecoded,
    });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer support-token' },
      params: { tenantId: 'tenant-b' },
      originalUrl: '/tenants/tenant-b/members',
    };
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      request,
    );

    let emitted: unknown;
    eventEmitter.once(
      'support.tenant.accessed',
      (payload) => (emitted = payload),
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-b');
    expect(emitted).toMatchObject({
      supportUserId: 'user-1',
      tenantId: 'tenant-b',
      route: '/tenants/tenant-b/members',
    });
  });

  it('does not emit support.tenant.accessed when the :tenantId already matches', async () => {
    const supportDecoded: DecodedToken = { ...baseDecoded, prole: 'support' };
    const { guard, eventEmitter } = createGuard({
      'support-token': supportDecoded,
    });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer support-token' },
      params: { tenantId: 'tenant-a' },
    };
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      request,
    );

    let emitted = false;
    eventEmitter.once('support.tenant.accessed', () => (emitted = true));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(emitted).toBe(false);
  });

  it('ignores an X-Tenant-Id-style header (tenant comes only from the token)', async () => {
    const { guard } = createGuard({ 'good-token': baseDecoded });
    const request: Record<string, unknown> = {
      headers: {
        authorization: 'Bearer good-token',
        'x-tenant-id': 'tenant-attacker',
      },
      params: { tenantId: 'tenant-a' },
    };
    const ctx = createContext(
      RolesController.prototype.ownerOnly,
      RolesController,
      request,
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.tenantId).toBe('tenant-a');
  });
});
