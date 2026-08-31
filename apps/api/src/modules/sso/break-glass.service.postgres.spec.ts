import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { generate } from 'otplib';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import { MfaService } from '../auth/services/mfa.service';
import { AuditService } from '../audit/audit.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { BreakGlassService } from './break-glass.service';

// Redis rate-limit keys aren't schema-scoped like the Postgres fixtures
// below, so a fixed IP would accumulate hits across repeated runs of this
// suite within the same hour — a random one keeps each run isolated.
function randomTestIp(): string {
  const octet = () => Math.floor(Math.random() * 255);
  return `10.${octet()}.${octet()}.${octet()}`;
}

describe('BreakGlassService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let redis: Redis;
  let service: BreakGlassService;
  let mfaService: MfaService;

  beforeAll(async () => {
    const db = await createTestDatabase('break-glass-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    redis = new Redis(process.env.REDIS_URL!);
    mfaService = new MfaService();
    service = new BreakGlassService(
      prisma,
      new PasswordService(),
      mfaService,
      new TokenService(prisma, new JwtService()),
      new RateLimitService(redis),
      new AuditService(prisma, new EventEmitter2()),
      new EventEmitter2(),
    );
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    redis.disconnect();
  });

  async function makeOwner(email: string, tenantSlug: string) {
    const tenant = await prisma.tenant.create({
      data: { slug: tenantSlug, name: tenantSlug },
    });
    const passwordHash = await argon2.hash('Passw0rd!Passw0rd!');
    const { secret, encrypted } = mfaService.generateSecret(email);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: email,
        mfaEnabled: true,
        mfaSecret: encrypted,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'owner' },
    });
    return { tenant, user, secret };
  }

  it('issues a 1-hour session with amr [pwd, otp, break_glass] for correct owner + password + TOTP', async () => {
    const { tenant, secret } = await makeOwner(
      'owner@break-glass-ok.com',
      'break-glass-ok',
    );
    const code = await generate({ secret });

    const result = await service.attempt(
      tenant.slug,
      'owner@break-glass-ok.com',
      'Passw0rd!Passw0rd!',
      code,
      randomTestIp(),
    );

    expect(result.activeRole).toBe('owner');
    const session = await prisma.session.findFirst({
      where: { userId: result.user.id },
    });
    expect(session?.amr).toEqual(['pwd', 'otp', 'break_glass']);
    const oneHourMs = 60 * 60 * 1000;
    expect(session!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      oneHourMs + 5000,
    );
  });

  it('rejects a non-owner even with correct password + TOTP', async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: 'break-glass-nonowner', name: 'break-glass-nonowner' },
    });
    const passwordHash = await argon2.hash('Passw0rd!Passw0rd!');
    const { secret, encrypted } = mfaService.generateSecret(
      'ops@break-glass-nonowner.com',
    );
    const user = await prisma.user.create({
      data: {
        email: 'ops@break-glass-nonowner.com',
        passwordHash,
        displayName: 'ops',
        mfaEnabled: true,
        mfaSecret: encrypted,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'operator' },
    });
    const code = await generate({ secret });

    await expect(
      service.attempt(
        tenant.slug,
        'ops@break-glass-nonowner.com',
        'Passw0rd!Passw0rd!',
        code,
        randomTestIp(),
      ),
    ).rejects.toThrow();
  });

  it('rejects the 6th attempt in an hour from the same IP', async () => {
    const { tenant, secret } = await makeOwner(
      'owner@break-glass-rl.com',
      'break-glass-rl',
    );
    const ip = randomTestIp();
    for (let i = 0; i < 5; i++) {
      const code = await generate({ secret });
      await service.attempt(
        tenant.slug,
        'owner@break-glass-rl.com',
        'Passw0rd!Passw0rd!',
        code,
        ip,
      );
    }
    const sixthCode = await generate({ secret });
    await expect(
      service.attempt(
        tenant.slug,
        'owner@break-glass-rl.com',
        'Passw0rd!Passw0rd!',
        sixthCode,
        ip,
      ),
    ).rejects.toThrow();
  });
});
