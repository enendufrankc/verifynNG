import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import {
  tenant as makeTenant,
  user as makeUser,
  product as makeProduct,
} from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import {
  ReportsService,
  canTransition,
} from '../../src/modules/reports/reports.service';
import { InMemoryConsent } from '../../src/modules/reports/consent/in-memory-consent.provider';
import type { NotificationService } from '../../src/modules/notifications/notifications.service';

function makeFakeNotifications() {
  const send = vi
    .fn()
    .mockResolvedValue({ outboxId: 'fake-outbox', status: 'queued' });
  return {
    send,
    asService: () => ({ send }) as unknown as NotificationService,
  };
}

describe('canTransition', () => {
  it('allows new -> triaged -> investigating -> closed', () => {
    expect(canTransition('new', 'triaged')).toBe(true);
    expect(canTransition('triaged', 'investigating')).toBe(true);
    expect(canTransition('investigating', 'closed')).toBe(true);
  });
  it('allows closed -> investigating (reopen)', () => {
    expect(canTransition('closed', 'investigating')).toBe(true);
  });
  it('rejects new -> investigating (skip)', () => {
    expect(canTransition('new', 'investigating')).toBe(false);
  });
});

describe('ReportsService admin flows (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: ReportsService;
  let notifications: ReturnType<typeof makeFakeNotifications>;

  beforeAll(async () => {
    const db = await createTestDatabase('reports-admin');
    prisma = db.prisma;
    schemaName = db.schemaName;
    notifications = makeFakeNotifications();
    service = new ReportsService(
      prisma,
      new EventEmitter2(),
      { verify: async () => ({ ok: true }) },
      new InMemoryConsent(),
      notifications.asService(),
    );
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('requires an outcome to close, records a status change row, assign + note', async () => {
    const tenant = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference: 'RPT-TEST01',
        verdictAtReport: 'red',
        purchaseChannel: 'open_market',
        ipHash: 'x',
      },
    });

    await service.assign(tenant.id, report.id, operator.id, operator.id);
    await service.addNote(
      tenant.id,
      report.id,
      operator.id,
      'Looks suspicious',
    );
    await service.changeStatus(tenant.id, report.id, operator.id, {
      status: 'triaged',
    });
    await service.changeStatus(tenant.id, report.id, operator.id, {
      status: 'investigating',
    });
    await expect(
      service.changeStatus(tenant.id, report.id, operator.id, {
        status: 'closed',
      }),
    ).rejects.toThrow();
    await service.changeStatus(tenant.id, report.id, operator.id, {
      status: 'closed',
      outcome: 'confirmed_counterfeit',
    });

    const detail = await service.detail(tenant.id, report.id);
    expect(detail.status).toBe('closed');
    expect(detail.outcome).toBe('confirmed_counterfeit');
    expect(detail.statusChanges).toHaveLength(3);
    expect(detail.notes).toHaveLength(1);
    expect(detail.assignedToId).toBe(operator.id);
  });

  it('rejects a cross-tenant detail lookup with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenantA.id,
        reference: 'RPT-TEST02',
        verdictAtReport: 'amber',
        purchaseChannel: 'pharmacy',
        ipHash: 'y',
      },
    });
    await expect(service.detail(tenantB.id, report.id)).rejects.toThrow();
  });

  it('rejects a cross-tenant assign with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenantA.id,
        reference: 'RPT-TEST03',
        verdictAtReport: 'amber',
        purchaseChannel: 'pharmacy',
        ipHash: 'cross-assign',
      },
    });
    await expect(
      service.assign(tenantB.id, report.id, operator.id, operator.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-tenant addNote with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenantA.id,
        reference: 'RPT-TEST04',
        verdictAtReport: 'amber',
        purchaseChannel: 'pharmacy',
        ipHash: 'cross-note',
      },
    });
    await expect(
      service.addNote(tenantB.id, report.id, operator.id, 'nope'),
    ).rejects.toThrow();
  });

  it('rejects a cross-tenant changeStatus with 404', async () => {
    const tenantA = await makeTenant(prisma);
    const tenantB = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenantA.id,
        reference: 'RPT-TEST05',
        verdictAtReport: 'amber',
        purchaseChannel: 'pharmacy',
        ipHash: 'cross-status',
      },
    });
    await expect(
      service.changeStatus(tenantB.id, report.id, operator.id, {
        status: 'triaged',
      }),
    ).rejects.toThrow();
  });

  it('rejects one of two concurrent status changes racing from the same starting status', async () => {
    const tenant = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference: 'RPT-TEST06',
        verdictAtReport: 'red',
        purchaseChannel: 'open_market',
        ipHash: 'race',
      },
    });

    const results = await Promise.allSettled([
      service.changeStatus(tenant.id, report.id, operator.id, {
        status: 'triaged',
      }),
      service.changeStatus(tenant.id, report.id, operator.id, {
        status: 'triaged',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const detail = await service.detail(tenant.id, report.id);
    expect(detail.status).toBe('triaged');
    expect(detail.statusChanges).toHaveLength(1);
  });

  it('omits contact columns for non-owner roles and includes them for owner', async () => {
    const tenant = await makeTenant(prisma);
    await prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference: 'RPT-CSV001',
        verdictAtReport: 'red',
        purchaseChannel: 'open_market',
        ipHash: 'z',
        contactEmail: 'consumer@example.com',
        contactPhone: '+2348000000001',
      },
    });

    const rowsNonOwner: unknown[][] = [];
    for await (const row of service.streamForExport(tenant.id, {}, false))
      rowsNonOwner.push(row);
    expect(rowsNonOwner[0]).not.toContain('contactEmail');
    expect(rowsNonOwner[1]).not.toContain('consumer@example.com');

    const rowsOwner: unknown[][] = [];
    for await (const row of service.streamForExport(tenant.id, {}, true))
      rowsOwner.push(row);
    expect(rowsOwner[0]).toContain('contactEmail');
    expect(rowsOwner[1]).toContain('consumer@example.com');
  });

  it('sends a report.consumer_update notification when notifyConsumer is set and the report has a contact email', async () => {
    const tenant = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const product = await makeProduct(prisma, {
      tenantId: tenant.id,
      name: 'Glow Serum',
    });
    const report = await prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference: 'RPT-NOTIFY1',
        productId: product.id,
        verdictAtReport: 'red',
        purchaseChannel: 'open_market',
        ipHash: 'notify-1',
        contactEmail: 'consumer@example.com',
      },
    });

    await service.changeStatus(tenant.id, report.id, operator.id, {
      status: 'triaged',
      notifyConsumer: true,
    });

    expect(notifications.send).toHaveBeenCalledWith(
      'report.consumer_update',
      { email: 'consumer@example.com' },
      {
        reference: 'RPT-NOTIFY1',
        productName: 'Glow Serum',
        status: 'triaged',
        outcome: undefined,
        statusUrl: `/v1/public/${tenant.slug}/reports/RPT-NOTIFY1`,
      },
      { tenantId: tenant.id },
    );
  });

  it('does not send report.consumer_update when the report has no contact email', async () => {
    const tenant = await makeTenant(prisma);
    const operator = await makeUser(prisma);
    const report = await prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference: 'RPT-NOTIFY2',
        verdictAtReport: 'red',
        purchaseChannel: 'open_market',
        ipHash: 'notify-2',
      },
    });

    notifications.send.mockClear();
    await service.changeStatus(tenant.id, report.id, operator.id, {
      status: 'triaged',
      notifyConsumer: true,
    });

    expect(notifications.send).not.toHaveBeenCalled();
  });
});
