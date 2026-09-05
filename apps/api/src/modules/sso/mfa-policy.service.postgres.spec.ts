import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { MfaPolicyService } from './mfa-policy.service';
import { MfaPolicyLoginHook } from './mfa-policy-login-hook';

describe('MfaPolicyService + MfaPolicyLoginHook (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: MfaPolicyService;
  let hook: MfaPolicyLoginHook;

  beforeAll(async () => {
    const db = await createTestDatabase('mfa-policy-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    const eventEmitter = new EventEmitter2();
    service = new MfaPolicyService(
      prisma,
      eventEmitter,
      new AuditService(prisma, eventEmitter),
    );
    hook = new MfaPolicyLoginHook(service);
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  async function makeUser(email: string, mfaEnabled = false) {
    return prisma.user.create({
      data: { email, displayName: email, mfaEnabled },
    });
  }
  async function makeTenant(slug: string) {
    return prisma.tenant.create({ data: { slug, name: slug } });
  }

  it('a viewer is never required to enrol even when owner/operator are', async () => {
    const tenant = await makeTenant('mfa-viewer-exempt');
    await service.set(
      tenant.id,
      { requiredRoles: ['owner', 'operator'], gracePeriodDays: 7 },
      'owner-1',
      undefined,
    );
    const user = await makeUser('viewer@mfa-viewer-exempt.com');

    const evaluation = await service.evaluate(user.id, tenant.id, 'viewer');
    expect(evaluation).toEqual({ required: false });

    const hookResult = await hook.afterPrimaryAuth({
      userId: user.id,
      tenantId: tenant.id,
      role: 'viewer',
    });
    expect(hookResult).toEqual({ requireMfa: false });
  });

  it('an operator within the grace window is allowed through with a grace deadline', async () => {
    const tenant = await makeTenant('mfa-grace');
    await service.set(
      tenant.id,
      { requiredRoles: ['operator'], gracePeriodDays: 7 },
      'owner-1',
      undefined,
    );
    const user = await makeUser('ops@mfa-grace.com');

    const result = await hook.afterPrimaryAuth({
      userId: user.id,
      tenantId: tenant.id,
      role: 'operator',
    });
    expect(result.requireMfa).toBe(true);
    expect(result.reason).toBe('grace');
    expect(result.graceUntil).toBeInstanceOf(Date);
  });

  it('an operator past the grace window is blocked with enrolment_required', async () => {
    const tenant = await makeTenant('mfa-grace-expired');
    await service.set(
      tenant.id,
      { requiredRoles: ['operator'], gracePeriodDays: 7 },
      'owner-1',
      undefined,
    );
    // Backdate enforcedFrom so the 7-day grace window has already elapsed —
    // stands in for E15's not-yet-available FakeClock (`clock:advance`).
    await prisma.tenantMfaPolicy.update({
      where: { tenantId: tenant.id },
      data: { enforcedFrom: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const user = await makeUser('ops@mfa-grace-expired.com');

    const result = await hook.afterPrimaryAuth({
      userId: user.id,
      tenantId: tenant.id,
      role: 'operator',
    });
    expect(result).toEqual({ requireMfa: true, reason: 'enrolment_required' });
  });

  it('an already-enrolled user is not gated by the hook (native mfaEnabled handles it)', async () => {
    const tenant = await makeTenant('mfa-already-enrolled');
    await service.set(
      tenant.id,
      { requiredRoles: ['owner'], gracePeriodDays: 7 },
      'owner-1',
      undefined,
    );
    const user = await makeUser('owner@mfa-already-enrolled.com', true);

    const result = await hook.afterPrimaryAuth({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
    });
    expect(result).toEqual({ requireMfa: false });
  });

  it('editing an already-enforced policy does not reset the grace clock', async () => {
    const tenant = await makeTenant('mfa-no-reset');
    const first = await service.set(
      tenant.id,
      { requiredRoles: ['operator'], gracePeriodDays: 7 },
      'owner-1',
      undefined,
    );
    const second = await service.set(
      tenant.id,
      { requiredRoles: ['operator', 'owner'], gracePeriodDays: 14 },
      'owner-1',
      undefined,
    );
    expect(second.enforcedFrom).toEqual(first.enforcedFrom);
  });
});
