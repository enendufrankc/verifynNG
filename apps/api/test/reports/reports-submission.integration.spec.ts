import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Request } from 'express';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import {
  tenant as makeTenant,
  product as makeProduct,
} from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { ReportsPublicController } from '../../src/modules/reports/reports-public.controller';
import { InMemoryConsent } from '../../src/modules/reports/consent/in-memory-consent.provider';
import type { CaptchaPort } from '../../src/modules/reports/captcha/captcha-port';
import type { PhotosService } from '../../src/modules/reports/photos.service';
import type { NotificationService } from '../../src/modules/notifications/notifications.service';
import { QuotaService } from '../../src/modules/quota/quota.service.js';
import { hashIp } from '../../src/common/ip-utils';

class FixedCaptcha implements CaptchaPort {
  constructor(private readonly ok: boolean) {}
  async verify() {
    return {
      ok: this.ok,
      reason: this.ok ? undefined : 'invalid-input-response',
    };
  }
}

function makeFakeNotifications() {
  const send = vi
    .fn()
    .mockResolvedValue({ outboxId: 'fake-outbox', status: 'queued' });
  return {
    send,
    asService: () => ({ send }) as unknown as NotificationService,
  };
}

describe('ReportsService.submit (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;

  beforeAll(async () => {
    const db = await createTestDatabase('reports-submission');
    prisma = db.prisma;
    schemaName = db.schemaName;
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('creates a report from a red-verdict scan event and rejects a green one', async () => {
    const tenant = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(
      prisma,
      events,
      new FixedCaptcha(true),
      new InMemoryConsent(),
      makeFakeNotifications().asService(),
    );

    const redScan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'abc***',
      },
    });

    const created: unknown[] = [];
    events.on('report.created', (p) => created.push(p));

    const result = await service.submit(
      tenant.slug,
      {
        scanEventId: redScan.id,
        purchaseChannel: 'open_market' as never,
        photoIds: [],
        captchaToken: 'ok-demo',
      } as never,
      { ip: '10.0.0.1', ipHash: 'iphash-a' },
    );
    expect(result.reference).toMatch(/^RPT-/);
    expect(created).toHaveLength(1);

    const greenScan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'green',
        source: 'qr',
        codeRedacted: 'def***',
      },
    });
    await expect(
      service.submit(
        tenant.slug,
        {
          scanEventId: greenScan.id,
          purchaseChannel: 'open_market' as never,
          photoIds: [],
          captchaToken: 'ok-demo',
        } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-a' },
      ),
    ).rejects.toThrow();
  });

  it('sends a report.consumer_ack notification when the consumer leaves a contact email', async () => {
    const tenant = await makeTenant(prisma);
    const product = await makeProduct(prisma, {
      tenantId: tenant.id,
      name: 'Glow Serum',
    });
    const notifications = makeFakeNotifications();
    const service = new ReportsService(
      prisma,
      new EventEmitter2(),
      new FixedCaptcha(true),
      new InMemoryConsent(),
      notifications.asService(),
    );
    const scan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'ack***',
        productId: product.id,
      },
    });

    const result = await service.submit(
      tenant.slug,
      {
        scanEventId: scan.id,
        purchaseChannel: 'open_market' as never,
        photoIds: [],
        captchaToken: 'ok-demo',
        contact: { email: 'consumer@example.com', consent: false },
      } as never,
      { ip: '10.0.0.2', ipHash: 'iphash-ack' },
    );

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(
      'report.consumer_ack',
      { email: 'consumer@example.com' },
      {
        reference: result.reference,
        productName: 'Glow Serum',
        statusUrl: result.statusUrl,
      },
      { tenantId: tenant.id },
    );
  });

  it('still creates the report and resolves successfully when the notification send rejects', async () => {
    const tenant = await makeTenant(prisma);
    const product = await makeProduct(prisma, {
      tenantId: tenant.id,
      name: 'Glow Serum',
    });
    const notifications = makeFakeNotifications();
    notifications.send.mockRejectedValue(
      new Error('notification_service_down'),
    );
    const service = new ReportsService(
      prisma,
      new EventEmitter2(),
      new FixedCaptcha(true),
      new InMemoryConsent(),
      notifications.asService(),
    );
    const scan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'dwn***',
        productId: product.id,
      },
    });

    const result = await service.submit(
      tenant.slug,
      {
        scanEventId: scan.id,
        purchaseChannel: 'open_market' as never,
        photoIds: [],
        captchaToken: 'ok-demo',
        contact: { email: 'consumer@example.com', consent: false },
      } as never,
      { ip: '10.0.0.3', ipHash: 'iphash-down' },
    );

    expect(result.reference).toMatch(/^RPT-/);
    const stored = await prisma.report.findUnique({
      where: { id: result.reportId },
    });
    expect(stored).not.toBeNull();
    expect(stored?.reference).toBe(result.reference);
  });

  it('rejects a scanEvent belonging to another tenant with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(
      prisma,
      events,
      new FixedCaptcha(true),
      new InMemoryConsent(),
      makeFakeNotifications().asService(),
    );
    const scan = await prisma.scanEvent.create({
      data: {
        tenantId: tenantB.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'ghi***',
      },
    });
    await expect(
      service.submit(
        tenantA.slug,
        {
          scanEventId: scan.id,
          purchaseChannel: 'open_market' as never,
          photoIds: [],
          captchaToken: 'ok-demo',
        } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-b' },
      ),
    ).rejects.toThrow();
  });

  it('rejects a failing captcha token', async () => {
    const tenant = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(
      prisma,
      events,
      new FixedCaptcha(false),
      new InMemoryConsent(),
      makeFakeNotifications().asService(),
    );
    const scan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'jkl***',
      },
    });
    await expect(
      service.submit(
        tenant.slug,
        {
          scanEventId: scan.id,
          purchaseChannel: 'open_market' as never,
          photoIds: [],
          captchaToken: 'fail-1',
        } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-c' },
      ),
    ).rejects.toThrow();
  });

  it('rejects submission for an offboarded tenant', async () => {
    const tenant = await makeTenant(prisma, { status: 'offboarded' } as never);
    const events = new EventEmitter2();
    const service = new ReportsService(
      prisma,
      events,
      new FixedCaptcha(true),
      new InMemoryConsent(),
      makeFakeNotifications().asService(),
    );
    await expect(
      service.submit(
        tenant.slug,
        {
          scanEventId: 'nonexistent',
          purchaseChannel: 'open_market' as never,
          photoIds: [],
          captchaToken: 'ok-demo',
        } as never,
        { ip: '10.0.0.1', ipHash: 'iphash-d' },
      ),
    ).rejects.toThrow();
  });

  it('allows submission for a suspended tenant (consumer safety)', async () => {
    const tenant = await makeTenant(prisma, { status: 'suspended' } as never);
    const events = new EventEmitter2();
    const service = new ReportsService(
      prisma,
      events,
      new FixedCaptcha(true),
      new InMemoryConsent(),
      makeFakeNotifications().asService(),
    );
    const scan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'mno***',
      },
    });
    const result = await service.submit(
      tenant.slug,
      {
        scanEventId: scan.id,
        purchaseChannel: 'open_market' as never,
        photoIds: [],
        captchaToken: 'ok-demo',
      } as never,
      { ip: '10.0.0.1', ipHash: 'iphash-e' },
    );
    expect(result.reference).toMatch(/^RPT-/);
  });
});

// Regression coverage for the review finding that ReportsPublicController.submit()
// called quota.assertWithinQuota() BEFORE the captcha check ran (the check lived
// only inside ReportsService.submit(), which ran after the quota increment) — an
// attacker could burn a legitimate IP's 5-per-hour report quota with garbage
// captcha tokens. The controller now verifies captcha first, exactly like
// requestUpload() already did, and passes captchaVerified: true through so
// ReportsService doesn't re-verify (and doesn't double-charge the captcha
// provider) on the already-checked path.
describe('ReportsPublicController.submit (integration) — captcha-before-quota ordering', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let redis: Redis;
  let quota: QuotaService;
  const salt = 'e08-test-salt';

  beforeAll(async () => {
    const db = await createTestDatabase('reports-submission-captcha-quota');
    prisma = db.prisma;
    schemaName = db.schemaName;
    redis = new Redis(process.env.REDIS_URL!);
    quota = new QuotaService(redis, prisma, new EventEmitter2());
    quota.registerKind('reports_per_ip_per_hour', {
      defaultLimit: 5,
      window: 'hour',
    });
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    redis.disconnect();
  });

  function makeController(captchaOk: boolean): ReportsPublicController {
    const reportsService = new ReportsService(
      prisma,
      new EventEmitter2(),
      new FixedCaptcha(captchaOk),
      new InMemoryConsent(),
      makeFakeNotifications().asService(),
    );
    const config = new ConfigService({
      TRUST_PROXY: false,
      IP_HASH_SALT: salt,
    });
    return new ReportsPublicController(
      config,
      reportsService,
      {} as PhotosService,
      quota,
      new FixedCaptcha(captchaOk),
      {} as Queue,
    );
  }

  function fakeRequest(ip: string): Request {
    return { headers: {}, socket: { remoteAddress: ip } } as unknown as Request;
  }

  it('never increments the quota counter across 10 submissions with an invalid captcha token', async () => {
    const tenant = await makeTenant(prisma);
    const controller = makeController(false);
    const ip = '203.0.113.9';

    for (let i = 0; i < 10; i++) {
      await expect(
        controller.submit(
          tenant.slug,
          {
            scanEventId: 'irrelevant',
            purchaseChannel: 'open_market' as never,
            photoIds: [],
            captchaToken: 'bad-token',
          } as never,
          fakeRequest(ip),
          undefined,
          undefined,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }

    const ipHash = hashIp(ip, salt);
    const { used } = await quota.peek(
      tenant.id,
      'reports_per_ip_per_hour',
      ipHash,
    );
    expect(used).toBe(0);
  });

  it('increments the quota once a valid-captcha submission actually succeeds', async () => {
    const tenant = await makeTenant(prisma);
    const controller = makeController(true);
    const scan = await prisma.scanEvent.create({
      data: {
        tenantId: tenant.id,
        tier: 'tier2',
        verdict: 'red',
        source: 'qr',
        codeRedacted: 'pqr***',
      },
    });
    const ip = '203.0.113.10';

    const result = await controller.submit(
      tenant.slug,
      {
        scanEventId: scan.id,
        purchaseChannel: 'open_market' as never,
        photoIds: [],
        captchaToken: 'ok-demo',
      } as never,
      fakeRequest(ip),
      undefined,
      undefined,
    );
    expect(result.reference).toMatch(/^RPT-/);

    const ipHash = hashIp(ip, salt);
    const { used } = await quota.peek(
      tenant.id,
      'reports_per_ip_per_hour',
      ipHash,
    );
    expect(used).toBe(1);
  });
});
