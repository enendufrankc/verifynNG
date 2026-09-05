import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatcher } from './webhook-dispatcher.js';

interface FakeEndpoint {
  id: string;
  tenantId: string;
  status: 'active' | 'disabled';
  events: string[];
}

function harness(endpoints: FakeEndpoint[]) {
  const created: Array<{
    endpointId: string;
    event: string;
    payload: unknown;
  }> = [];
  const enqueued: Array<{ deliveryId: string }> = [];

  const prisma = {
    webhookEndpoint: {
      findMany: vi.fn(
        async ({ where }: { where: { tenantId: string; status: string } }) =>
          endpoints.filter(
            (e) => e.tenantId === where.tenantId && e.status === where.status,
          ),
      ),
    },
    webhookDelivery: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { endpointId: string; event: string; payload: unknown };
        }) => {
          const id = `delivery-${created.length + 1}`;
          created.push(data);
          return { id, ...data };
        },
      ),
    },
  };
  const queue = {
    add: vi.fn(async (_name: string, data: { deliveryId: string }) => {
      enqueued.push(data);
    }),
  };

  const dispatcher = new WebhookDispatcher(prisma as never, queue as never);
  return { dispatcher, created, enqueued };
}

describe('WebhookDispatcher', () => {
  it('creates one delivery per endpoint subscribed to the exact event, skipping others', async () => {
    const { dispatcher, created, enqueued } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['unit.flagged'],
      },
      {
        id: 'ep-2',
        tenantId: 't1',
        status: 'active',
        events: ['batch.minted'],
      },
      { id: 'ep-3', tenantId: 't1', status: 'active', events: ['*'] },
      {
        id: 'ep-4',
        tenantId: 't2',
        status: 'active',
        events: ['unit.flagged'],
      }, // other tenant
      {
        id: 'ep-5',
        tenantId: 't1',
        status: 'disabled',
        events: ['unit.flagged'],
      }, // disabled
    ]);

    await dispatcher.onUnitFlagged({
      tenantId: 't1',
      unitId: 'u1',
      batchId: 'b1',
      reason: 'counterfeit',
    });

    expect(created.map((c) => c.endpointId).sort()).toEqual(['ep-1', 'ep-3']);
    expect(created.every((c) => c.event === 'unit.flagged')).toBe(true);
    expect(enqueued).toHaveLength(2);
  });

  it('fires scan.suspicious for a suspicious verdict', async () => {
    const { dispatcher, created } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['scan.suspicious'],
      },
    ]);
    await dispatcher.onScanRecorded({
      tenantId: 't1',
      scanEventId: 's1',
      unitId: 'u1',
      batchId: 'b1',
      tier: 2,
      verdict: 'suspicious',
      geo: null,
      at: new Date('2026-08-31T00:00:00Z'),
    });
    expect(created).toHaveLength(1);
    expect(created[0].event).toBe('scan.suspicious');
  });

  it('fires scan.suspicious for a flagged verdict', async () => {
    const { dispatcher, created } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['scan.suspicious'],
      },
    ]);
    await dispatcher.onScanRecorded({
      tenantId: 't1',
      scanEventId: 's1',
      unitId: 'u1',
      batchId: 'b1',
      tier: 2,
      verdict: 'flagged',
      geo: null,
      at: new Date(),
    });
    expect(created).toHaveLength(1);
  });

  it('fires scan.suspicious for an unknown verdict on a tier-2 scan', async () => {
    const { dispatcher, created } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['scan.suspicious'],
      },
    ]);
    await dispatcher.onScanRecorded({
      tenantId: 't1',
      scanEventId: 's1',
      unitId: null,
      batchId: null,
      tier: 2,
      verdict: 'unknown',
      geo: null,
      at: new Date(),
    });
    expect(created).toHaveLength(1);
  });

  it('does not fire scan.suspicious for an unknown verdict on a tier-1 scan', async () => {
    const { dispatcher, created } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['scan.suspicious'],
      },
    ]);
    await dispatcher.onScanRecorded({
      tenantId: 't1',
      scanEventId: 's1',
      unitId: null,
      batchId: null,
      tier: 1,
      verdict: 'unknown',
      geo: null,
      at: new Date(),
    });
    expect(created).toHaveLength(0);
  });

  it('does not fire scan.suspicious for an authentic/ok verdict', async () => {
    const { dispatcher, created } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['scan.suspicious'],
      },
    ]);
    await dispatcher.onScanRecorded({
      tenantId: 't1',
      scanEventId: 's1',
      unitId: 'u1',
      batchId: 'b1',
      tier: 2,
      verdict: 'authentic',
      geo: null,
      at: new Date(),
    });
    expect(created).toHaveLength(0);
  });

  it('does nothing when no endpoint is subscribed', async () => {
    const { dispatcher, created, enqueued } = harness([
      {
        id: 'ep-1',
        tenantId: 't1',
        status: 'active',
        events: ['batch.minted'],
      },
    ]);
    await dispatcher.onUnitFlagged({
      tenantId: 't1',
      unitId: 'u1',
      batchId: 'b1',
      reason: 'counterfeit',
    });
    expect(created).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });
});
