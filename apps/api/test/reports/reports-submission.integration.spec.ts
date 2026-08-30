import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant as makeTenant } from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { InMemoryConsent } from '../../src/modules/reports/consent/in-memory-consent.provider';
import type { CaptchaPort } from '../../src/modules/reports/captcha/captcha-port';

class FixedCaptcha implements CaptchaPort {
  constructor(private readonly ok: boolean) {}
  async verify() {
    return {
      ok: this.ok,
      reason: this.ok ? undefined : 'invalid-input-response',
    };
  }
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

  it('rejects a scanEvent belonging to another tenant with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const events = new EventEmitter2();
    const service = new ReportsService(
      prisma,
      events,
      new FixedCaptcha(true),
      new InMemoryConsent(),
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
