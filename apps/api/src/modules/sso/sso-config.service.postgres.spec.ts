import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { SsoConfigService } from './sso-config.service';
import { AllowAllSsoEntitlement } from './entitlement.port';

const ENC_KEY = Buffer.alloc(32, 7).toString('hex');

describe('SsoConfigService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: SsoConfigService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    const db = await createTestDatabase('sso-config-service-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    eventEmitter = new EventEmitter2();
    process.env.SSO_CLIENT_SECRET_ENC_KEY = ENC_KEY;
    const audit = new AuditService(prisma, eventEmitter);
    service = new SsoConfigService(
      prisma,
      eventEmitter,
      audit,
      new AllowAllSsoEntitlement(),
    );
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  async function makeTenant(slug: string) {
    return prisma.tenant.create({ data: { slug, name: slug } });
  }

  it('upsert() creates a config, encrypts the secret, and never persists it in plaintext', async () => {
    const tenant = await makeTenant('sso-create');

    const result = await service.upsert(tenant.id, 'owner-1', '1.2.3.4', {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'super-secret-value',
      issuer: 'http://fake-oidc:4104/default',
      allowedDomains: ['Example.com', ' other.com '],
      jitProvisioning: true,
      jitDefaultRole: 'viewer',
      enforceSso: false,
    });

    expect(result.enabled).toBe(true);
    expect(result.clientSecretLast4).toBe('alue');
    expect(result.allowedDomains).toEqual(['example.com', 'other.com']);

    const stored = await prisma.tenantSsoConfig.findUniqueOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(stored.clientSecretEnc).not.toContain('super-secret-value');
  });

  it('upsert() records an audit entry with field names only, never values', async () => {
    const tenant = await makeTenant('sso-audit');
    const emitSpy = vi.spyOn(eventEmitter, 'emit');

    await service.upsert(tenant.id, 'owner-2', undefined, {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'another-secret',
      allowedDomains: ['ivoryglow.com'],
      jitProvisioning: true,
      enforceSso: false,
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: tenant.id, action: 'sso.config.changed' },
    });
    const payload = log.payload as { changes: string[]; enforceSso: boolean };
    expect(payload.changes).toEqual(
      expect.arrayContaining([
        'provider',
        'clientId',
        'clientSecret',
        'allowedDomains',
        'jitProvisioning',
      ]),
    );
    expect(JSON.stringify(payload)).not.toContain('another-secret');
    expect(JSON.stringify(payload)).not.toContain('verifyng-local');

    expect(emitSpy).toHaveBeenCalledWith(
      'sso.config.changed',
      expect.objectContaining({ tenantId: tenant.id, actorId: 'owner-2' }),
    );
  });

  // The fake-provider-in-production guard reads NODE_ENV through packages/config's
  // memoized loadEnv(), so it isn't exercised here — see OidcClientFactory's
  // startup assertion (T2) for the actual production safety net, which constructs
  // fresh per-process and is testable.

  it('rejects an unsupported provider', async () => {
    const tenant = await makeTenant('sso-bad-provider');
    await expect(
      service.upsert(tenant.id, 'owner-5', undefined, {
        // @ts-expect-error deliberately invalid at the HTTP boundary
        provider: 'okta',
        clientId: 'x',
        clientSecret: 's',
      }),
    ).rejects.toThrow();
  });

  it('disable() turns off enabled and enforceSso and keeps the config row', async () => {
    const tenant = await makeTenant('sso-disable');
    await service.upsert(tenant.id, 'owner-4', undefined, {
      provider: 'fake',
      clientId: 'x',
      clientSecret: 's',
      allowedDomains: ['a.com'],
      enforceSso: false,
    });
    // Flipping enforceSso through upsert() is now gated by preconditions
    // (SSO tested recently, owner logged in via SSO, all owners have TOTP) —
    // set it directly here since this test is about disable()'s own
    // behaviour, not those preconditions (covered separately).
    await prisma.tenantSsoConfig.update({
      where: { tenantId: tenant.id },
      data: { enforceSso: true },
    });

    await service.disable(tenant.id, 'owner-4', undefined);

    const stored = await prisma.tenantSsoConfig.findUniqueOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(stored.enabled).toBe(false);
    expect(stored.enforceSso).toBe(false);
    expect(stored.allowedDomains).toEqual(['a.com']);
  });

  it('get() returns { enabled: false } when nothing is configured', async () => {
    const tenant = await makeTenant('sso-none');
    await expect(service.get(tenant.id)).resolves.toEqual({ enabled: false });
  });

  describe('enforceSso preconditions', () => {
    it('409s listing every unmet precondition when nothing has been done yet', async () => {
      const tenant = await makeTenant('sso-enforce-unmet');
      const owner = await prisma.user.create({
        data: { email: 'owner@sso-enforce-unmet.com', displayName: 'Owner' },
      });
      await prisma.membership.create({
        data: { userId: owner.id, tenantId: tenant.id, role: 'owner' },
      });
      await service.upsert(tenant.id, owner.id, undefined, {
        provider: 'fake',
        clientId: 'x',
        clientSecret: 's',
        allowedDomains: ['a.com'],
      });

      let caught: unknown;
      try {
        await service.upsert(tenant.id, owner.id, undefined, {
          provider: 'fake',
          clientId: 'x',
          clientSecret: 's',
          allowedDomains: ['a.com'],
          enforceSso: true,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Object);
      const response = (
        caught as { getResponse: () => { unmet: string[] } }
      ).getResponse();
      expect(response.unmet).toEqual(
        expect.arrayContaining([
          expect.stringContaining('tested successfully'),
          expect.stringContaining('logged in via SSO'),
          expect.stringContaining('no TOTP enrolled'),
        ]),
      );
    });

    it('succeeds once the SSO test passed recently, the owner has an SsoIdentity, and every owner has TOTP', async () => {
      const tenant = await makeTenant('sso-enforce-met');
      const owner = await prisma.user.create({
        data: {
          email: 'owner@sso-enforce-met.com',
          displayName: 'Owner',
          mfaEnabled: true,
        },
      });
      await prisma.membership.create({
        data: { userId: owner.id, tenantId: tenant.id, role: 'owner' },
      });
      await service.upsert(tenant.id, owner.id, undefined, {
        provider: 'fake',
        clientId: 'x',
        clientSecret: 's',
        allowedDomains: ['a.com'],
      });
      await service.recordTestResult(tenant.id, true, 'ok');
      await prisma.ssoIdentity.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          provider: 'fake',
          subject: 'owner-sub',
          email: owner.email,
        },
      });

      const result = await service.upsert(tenant.id, owner.id, undefined, {
        provider: 'fake',
        clientId: 'x',
        clientSecret: 's',
        allowedDomains: ['a.com'],
        enforceSso: true,
      });
      expect(result.enforceSso).toBe(true);
    });
  });
});
