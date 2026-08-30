import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { tenant as makeTenant, user as makeUser } from '@verifynng/db/testing';
import type { PrismaClient } from '@prisma/client';
import {
  ReportsService,
  canTransition,
} from '../../src/modules/reports/reports.service';
import { InMemoryConsent } from '../../src/modules/reports/consent/in-memory-consent.provider';

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

  beforeAll(async () => {
    const db = await createTestDatabase('reports-admin');
    prisma = db.prisma;
    schemaName = db.schemaName;
    service = new ReportsService(
      prisma,
      new EventEmitter2(),
      { verify: async () => ({ ok: true }) },
      new InMemoryConsent(),
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

    await service.assign(tenant.id, report.id, operator.id);
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
});
