import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { SsoConfigService } from './sso-config.service';
import { OidcClientFactory } from './oidc-client-factory';
import { AllowAllSsoEntitlement } from './entitlement.port';

const ENC_KEY = Buffer.alloc(32, 9).toString('hex');
// This spec talks to the real fake-oidc container from the host (not from
// inside compose), so it needs the host-published port rather than the
// compose-network hostname FAKE_OIDC_ISSUER points at.
const FAKE_OIDC_HOST_URL = `http://localhost:${process.env.FAKE_OIDC_PORT ?? '4104'}/default`;

describe('OidcClientFactory (integration, requires fake-oidc)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let ssoConfig: SsoConfigService;
  let factory: OidcClientFactory;

  beforeAll(async () => {
    const db = await createTestDatabase('oidc-client-factory-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    process.env.SSO_CLIENT_SECRET_ENC_KEY = ENC_KEY;
    const eventEmitter = new EventEmitter2();
    const audit = new AuditService(prisma, eventEmitter);
    ssoConfig = new SsoConfigService(
      prisma,
      eventEmitter,
      audit,
      new AllowAllSsoEntitlement(),
    );
    factory = new OidcClientFactory(ssoConfig);
    // In the real app, Nest's EventEmitterModule wires @OnEvent listeners to
    // the shared EventEmitter2 automatically at bootstrap via its discovery
    // pass; constructing the class directly (as every other spec in this
    // module does — no TestingModule) skips that, so the subscription is
    // wired by hand here to exercise the same handler method.
    eventEmitter.on('sso.config.changed', (payload: { tenantId: string }) =>
      factory.onConfigChanged(payload),
    );
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  async function makeTenant(slug: string) {
    return prisma.tenant.create({ data: { slug, name: slug } });
  }

  it('discovers the fake issuer and caches the Configuration per tenant', async () => {
    const tenant = await makeTenant('oidc-discover');
    await ssoConfig.upsert(tenant.id, 'owner-1', undefined, {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'local-dev-secret',
      issuer: FAKE_OIDC_HOST_URL,
      allowedDomains: ['ivoryglow.com'],
    });

    const config1 = await factory.buildClient(tenant.id);
    const config2 = await factory.buildClient(tenant.id);
    expect(config1).toBe(config2); // same object → cache hit

    expect(config1.serverMetadata().issuer).toBe(FAKE_OIDC_HOST_URL);
  });

  it('testConnection() reports ok with issuer and authorization endpoint, and records the result', async () => {
    const tenant = await makeTenant('oidc-test-ok');
    await ssoConfig.upsert(tenant.id, 'owner-2', undefined, {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'local-dev-secret',
      issuer: FAKE_OIDC_HOST_URL,
    });

    const result = await factory.testConnection(tenant.id);
    expect(result.ok).toBe(true);
    expect(result.issuer).toBe(FAKE_OIDC_HOST_URL);
    expect(result.authorizationEndpoint).toBe(
      `${FAKE_OIDC_HOST_URL}/authorize`,
    );

    const saved = await ssoConfig.get(tenant.id);
    expect(saved.lastTestResult).toBe('ok');
    expect(saved.lastTestedAt).toBeTruthy();
  });

  it('testConnection() reports a failure and records it when the issuer is unreachable', async () => {
    const tenant = await makeTenant('oidc-test-unreachable');
    await ssoConfig.upsert(tenant.id, 'owner-3', undefined, {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'local-dev-secret',
      issuer: 'http://127.0.0.1:1/default', // nothing listens here
    });

    const result = await factory.testConnection(tenant.id);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();

    const saved = await ssoConfig.get(tenant.id);
    expect(saved.lastTestResult).toMatch(/^error:/);
  });

  it('invalidates the cache when sso.config.changed fires for that tenant', async () => {
    const tenant = await makeTenant('oidc-invalidate');
    await ssoConfig.upsert(tenant.id, 'owner-4', undefined, {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'local-dev-secret',
      issuer: FAKE_OIDC_HOST_URL,
    });
    const before = await factory.buildClient(tenant.id);

    // Re-upserting emits sso.config.changed, which OidcClientFactory listens
    // to via @OnEvent to drop its cache entry for this tenant.
    await ssoConfig.upsert(tenant.id, 'owner-4', undefined, {
      provider: 'fake',
      clientId: 'verifyng-local',
      clientSecret: 'a-different-secret',
      issuer: FAKE_OIDC_HOST_URL,
    });

    const after = await factory.buildClient(tenant.id);
    expect(after).not.toBe(before);
  });
});
