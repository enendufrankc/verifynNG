import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { SsoConfigService } from './sso-config.service';
import { AllowAllSsoEntitlement } from './entitlement.port';
import { EnforceSsoLoginHook } from './enforce-sso-login-hook';

const ENC_KEY = Buffer.alloc(32, 3).toString('hex');

describe('EnforceSsoLoginHook (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let ssoConfig: SsoConfigService;
  let hook: EnforceSsoLoginHook;

  beforeAll(async () => {
    const db = await createTestDatabase('enforce-sso-hook-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    process.env.SSO_CLIENT_SECRET_ENC_KEY = ENC_KEY;
    const eventEmitter = new EventEmitter2();
    ssoConfig = new SsoConfigService(
      prisma,
      eventEmitter,
      new AuditService(prisma, eventEmitter),
      new AllowAllSsoEntitlement(),
    );
    hook = new EnforceSsoLoginHook(ssoConfig);
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  async function makeTenant(slug: string) {
    return prisma.tenant.create({ data: { slug, name: slug } });
  }

  it('does nothing for a tenant with no SSO configured', async () => {
    const tenant = await makeTenant('enforce-none');
    await expect(
      hook.beforePasswordLogin({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      }),
    ).resolves.toBeUndefined();
  });

  it('does nothing when SSO is configured but not enforced', async () => {
    const tenant = await makeTenant('enforce-off');
    await ssoConfig.upsert(tenant.id, 'owner-1', undefined, {
      provider: 'fake',
      clientId: 'x',
      clientSecret: 's',
      allowedDomains: ['a.com'],
      enforceSso: false,
    });
    await expect(
      hook.beforePasswordLogin({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws sso_required with a ssoStartUrl when enforceSso is on', async () => {
    const tenant = await makeTenant('enforce-on');
    await ssoConfig.upsert(tenant.id, 'owner-1', undefined, {
      provider: 'fake',
      clientId: 'x',
      clientSecret: 's',
      allowedDomains: ['a.com'],
    });
    await prisma.tenantSsoConfig.update({
      where: { tenantId: tenant.id },
      data: { enforceSso: true },
    });

    let caught: unknown;
    try {
      await hook.beforePasswordLogin({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      });
    } catch (err) {
      caught = err;
    }
    const response = (
      caught as { getResponse: () => { code: string; ssoStartUrl: string } }
    ).getResponse();
    expect(response.code).toBe('sso_required');
    expect(response.ssoStartUrl).toBe(`/auth/sso/${tenant.slug}/start`);
  });
});
