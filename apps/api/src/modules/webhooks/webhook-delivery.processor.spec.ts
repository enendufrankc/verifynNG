import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const encryptedFor = new Map<string, string>();
vi.mock('@verifynng/config', () => ({
  loadEnv: () => ({
    WEBHOOKS_MAX_ATTEMPTS: 3,
    WEBHOOKS_BACKOFF_BASE_MS: 10,
    WEBHOOK_SECRET_ENC_KEY: '0'.repeat(64),
  }),
}));
vi.mock('./webhook-secret-crypto.js', () => ({
  decryptWebhookSecret: (enc: string) => encryptedFor.get(enc) ?? 'whsec_test',
}));

import { WebhookDeliveryProcessor } from './webhook-delivery.processor.js';
import { WebhookSigner } from './webhook-signer.js';

// A real local HTTP server as the delivery destination — see
// docs/epics/E16-public-api-webhooks.md's Testing section: "processor state
// transitions with a local HTTP stub returning 200/500/timeout".
describe('WebhookDeliveryProcessor', () => {
  let server: http.Server;
  let baseUrl: string;
  let nextResponse: { status: number; delayMs?: number } = { status: 200 };
  const receivedHeaders: http.IncomingHttpHeaders[] = [];
  const receivedBodies: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      receivedHeaders.push(req.headers);
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        receivedBodies.push(Buffer.concat(chunks).toString('utf8'));
        const respond = () => {
          res.writeHead(nextResponse.status, { 'Content-Type': 'text/plain' });
          res.end('ok');
        };
        if (nextResponse.delayMs) {
          setTimeout(respond, nextResponse.delayMs);
        } else {
          respond();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    nextResponse = { status: 200 };
    receivedHeaders.length = 0;
    receivedBodies.length = 0;
  });

  function harness() {
    const endpoint = {
      id: 'endpoint-1',
      url: `${baseUrl}/hook`,
      secretEnc: 'enc',
      failureStreak: 0,
      status: 'active',
    };
    encryptedFor.set('enc', 'whsec_test');

    const deliveries = new Map<
      string,
      {
        id: string;
        tenantId: string;
        endpointId: string;
        event: string;
        payload: unknown;
        attempts: number;
        status: string;
        lastStatusCode: number | null;
        lastError: string | null;
        createdAt: Date;
        endpoint: typeof endpoint;
      }
    >();
    deliveries.set('d1', {
      id: 'd1',
      tenantId: 't1',
      endpointId: 'endpoint-1',
      event: 'unit.flagged',
      payload: { unitId: 'u1' },
      attempts: 0,
      status: 'pending',
      lastStatusCode: null,
      lastError: null,
      createdAt: new Date(),
      endpoint,
    });

    const events: Array<{ name: string; payload: unknown }> = [];
    const enqueued: Array<{ deliveryId: string; delay?: number }> = [];

    const prisma = {
      webhookDelivery: {
        findUnique: vi.fn(
          async ({ where: { id } }: { where: { id: string } }) =>
            deliveries.get(id) ?? null,
        ),
        update: vi.fn(
          async ({
            where: { id },
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const current = deliveries.get(id)!;
            const updated = { ...current, ...data };
            deliveries.set(id, updated as never);
            return updated;
          },
        ),
      },
      webhookEndpoint: {
        update: vi.fn(
          async ({
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const streakOp = data.failureStreak as
              | { increment?: number }
              | number
              | undefined;
            if (
              typeof streakOp === 'object' &&
              streakOp?.increment !== undefined
            ) {
              endpoint.failureStreak += streakOp.increment;
            } else if (typeof streakOp === 'number') {
              endpoint.failureStreak = streakOp;
            }
            if ('status' in data) {
              endpoint.status = data.status as string;
            }
            return endpoint;
          },
        ),
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const queue = {
      add: vi.fn(
        async (
          _name: string,
          data: { deliveryId: string },
          opts: { delay?: number },
        ) => {
          enqueued.push({ deliveryId: data.deliveryId, delay: opts?.delay });
        },
      ),
    };
    const eventEmitter = {
      emit: vi.fn((name: string, payload: unknown) =>
        events.push({ name, payload }),
      ),
    };

    const processor = new WebhookDeliveryProcessor(
      prisma as never,
      new WebhookSigner(),
      queue as never,
      eventEmitter as never,
    );
    return { processor, deliveries, endpoint, events, enqueued, prisma };
  }

  it('marks a 2xx response succeeded and resets the failure streak', async () => {
    const { processor, deliveries, endpoint } = harness();
    endpoint.failureStreak = 3;
    nextResponse = { status: 200 };

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    expect(deliveries.get('d1')!.status).toBe('succeeded');
    expect(deliveries.get('d1')!.attempts).toBe(1);
    expect(endpoint.failureStreak).toBe(0);
  });

  it('sends the wire-format headers and body', async () => {
    const { processor } = harness();
    nextResponse = { status: 200 };

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    expect(receivedHeaders[0]['x-verifyng-event']).toBe('unit.flagged');
    expect(receivedHeaders[0]['x-verifyng-delivery']).toBe('d1');
    expect(receivedHeaders[0]['x-verifyng-signature']).toMatch(
      /^v1=[0-9a-f]{64}$/,
    );
    const body = JSON.parse(receivedBodies[0]);
    expect(body).toMatchObject({
      id: 'd1',
      type: 'unit.flagged',
      tenantId: 't1',
      data: { unitId: 'u1' },
    });
  });

  it('schedules a retry with backoff on a 500, below max attempts', async () => {
    const { processor, deliveries, enqueued, events } = harness();
    nextResponse = { status: 500 };

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    expect(deliveries.get('d1')!.status).toBe('failed');
    expect(deliveries.get('d1')!.attempts).toBe(1);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].delay).toBeGreaterThan(0);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      deadLettered: false,
      attempts: 1,
    });
  });

  it('treats a connection failure (unreachable endpoint) as a retryable failure', async () => {
    const { processor, deliveries } = harness();
    deliveries.get('d1')!.endpoint.url = 'http://127.0.0.1:1/hook'; // port 1: connection refused

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    const delivery = deliveries.get('d1')!;
    expect(delivery.status).toBe('failed');
    expect(delivery.lastStatusCode).toBeNull();
    expect(delivery.lastError).toBeTruthy();
  });

  it('dead-letters and auto-disables the endpoint at a 50 failure streak', async () => {
    const { processor, deliveries, endpoint, events } = harness();
    endpoint.failureStreak = 49;
    nextResponse = { status: 500 };
    deliveries.get('d1')!.attempts = 2; // next failure is the 3rd = max

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    expect(deliveries.get('d1')!.status).toBe('dead');
    expect(endpoint.failureStreak).toBe(50);
    expect(endpoint.status).toBe('disabled');
    expect(events[0].payload).toMatchObject({
      deadLettered: true,
      attempts: 3,
    });
  });

  it('dead-letters without disabling below a 50 failure streak', async () => {
    const { processor, deliveries, endpoint } = harness();
    endpoint.failureStreak = 1;
    nextResponse = { status: 500 };
    deliveries.get('d1')!.attempts = 2;

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    expect(deliveries.get('d1')!.status).toBe('dead');
    expect(endpoint.failureStreak).toBe(2);
    expect(endpoint.status ?? 'active').toBe('active');
  });

  it('is a no-op when the delivery is already succeeded (racing job)', async () => {
    const { processor, deliveries, prisma } = harness();
    deliveries.get('d1')!.status = 'succeeded';

    await processor.process({ data: { deliveryId: 'd1' } } as never);

    expect(prisma.webhookDelivery.update).not.toHaveBeenCalled();
  });
});
