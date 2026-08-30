import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { UsageKind } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { MeteringService } from './metering.service';
import { EventsService } from '../../common/events.service';
import { MeteringMonthCloseService } from './jobs/month-close.service';

describe('Metering integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;
  let events: EventsService;
  let metering: MeteringService;

  beforeAll(async () => {
    const result = await createTestDatabase('metering-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    const t = await prisma.tenant.create({
      data: {
        slug: 'metering-integration-tenant',
        name: 'Metering Integration Tenant',
      },
    });
    tenantId = t.id;

    events = new EventsService(new EventEmitter2());
    metering = new MeteringService(prisma, events);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('MeterPort.record is idempotent under concurrent calls with the same key', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        metering.record({
          tenantId,
          kind: UsageKind.code_minted,
          quantity: 500,
          idempotencyKey: 'concurrent-batch',
        }),
      ),
    );

    const rows = await prisma.usageEvent.findMany({
      where: {
        tenantId,
        kind: UsageKind.code_minted,
        idempotencyKey: 'concurrent-batch',
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(500);
  });

  it('UsageEvent rejects UPDATE at the database level', async () => {
    const row = await prisma.usageEvent.create({
      data: {
        tenantId,
        kind: UsageKind.scan_tier1,
        quantity: 1,
        occurredAt: new Date(),
      },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "UsageEvent" SET quantity = 999 WHERE id = $1`,
        row.id,
      ),
    ).rejects.toThrow(/UsageEvent is immutable/);
  });

  it('finaliseMonth is idempotent and emits usage.summary.finalised exactly once', async () => {
    const monthCloseTenant = (
      await prisma.tenant.create({
        data: {
          slug: 'metering-monthclose-tenant',
          name: 'Metering Month Close Tenant',
        },
      })
    ).id;

    const finalisedEvents: unknown[] = [];
    const emitter = new EventEmitter2();
    const trackedEvents = new EventsService(emitter);
    emitter.on('usage.summary.finalised', (payload: unknown) =>
      finalisedEvents.push(payload),
    );
    const trackedMonthClose = new MeteringMonthCloseService(
      prisma,
      trackedEvents,
    );
    const trackedMetering = new MeteringService(prisma, trackedEvents);

    const month = '2026-01';
    await trackedMetering.record({
      tenantId: monthCloseTenant,
      kind: UsageKind.scan_tier1,
      quantity: 3,
      occurredAt: new Date(`${month}-15T00:00:00.000Z`),
      idempotencyKey: 'mc-scan-1',
    });

    const first = await trackedMonthClose.finaliseMonth(month);
    expect(first.tenantsFinalised).toBe(1);
    expect(finalisedEvents).toHaveLength(1);
    expect(finalisedEvents[0]).toMatchObject({
      tenantId: monthCloseTenant,
      month,
      kinds: expect.objectContaining({ 'scan.tier1': 3 }),
    });

    const second = await trackedMonthClose.finaliseMonth(month);
    expect(second.tenantsFinalised).toBe(0);
    expect(finalisedEvents).toHaveLength(1); // still just the one emission
  }, 15000);
});
