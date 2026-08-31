import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { loadEnv } from '@verifynng/config';
import { WebhookSigner } from './webhook-signer.js';
import { decryptWebhookSecret } from './webhook-secret-crypto.js';
import { buildWebhookEnvelope } from './webhook-envelope.js';
import { computeBackoffMs } from './webhook-backoff.js';

const SEND_TIMEOUT_MS = 10_000;
const AUTO_DISABLE_STREAK = 50;

/**
 * Delivers one `WebhookDelivery` per BullMQ job. 2xx → succeeded; otherwise
 * schedules a retry (`min(24h, base × 2^attempts) + jitter`) up to
 * WEBHOOKS_MAX_ATTEMPTS, then dead-letters. `webhook.delivery.failed` fires
 * on every failed attempt (see `deadLettered` to distinguish retry vs
 * terminal) so E14 can notify on dead-letter per the cross-epic request.
 */
@Processor('webhooks', { concurrency: 5 })
export class WebhookDeliveryProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly signer: WebhookSigner,
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<{ deliveryId: string }>): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { endpoint: true },
    });
    // Deleted endpoint (cascade) or already resolved by a prior/racing job.
    if (!delivery) return;
    if (delivery.status === 'succeeded' || delivery.status === 'dead') return;

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'delivering' },
    });

    const secret = decryptWebhookSecret(delivery.endpoint.secretEnc);
    const body = buildWebhookEnvelope(delivery);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.signer.sign(secret, timestamp, body);

    const { statusCode, responseText, errorMessage } = await this.send(
      delivery.endpoint.url,
      delivery.event,
      delivery.id,
      timestamp,
      signature,
      body,
    );

    const succeeded =
      statusCode !== undefined && statusCode >= 200 && statusCode < 300;
    const attempts = delivery.attempts + 1;

    if (succeeded) {
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'succeeded',
            attempts,
            lastStatusCode: statusCode,
            lastResponse: responseText,
            lastError: null,
            deliveredAt: new Date(),
            nextAttemptAt: null,
          },
        }),
        this.prisma.webhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { failureStreak: 0 },
        }),
      ]);
      return;
    }

    const env = loadEnv();
    const lastStatus = statusCode ?? errorMessage ?? 'unknown';

    if (attempts >= env.WEBHOOKS_MAX_ATTEMPTS) {
      const endpoint = await this.prisma.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: { failureStreak: { increment: 1 } },
      });
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'dead',
          attempts,
          lastStatusCode: statusCode ?? null,
          lastResponse: responseText,
          lastError: errorMessage ?? null,
          nextAttemptAt: null,
        },
      });
      if (endpoint.failureStreak >= AUTO_DISABLE_STREAK) {
        await this.prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { status: 'disabled' },
        });
      }
      this.eventEmitter.emit('webhook.delivery.failed', {
        tenantId: delivery.tenantId,
        endpointId: delivery.endpointId,
        deliveryId: delivery.id,
        event: delivery.event,
        attempts,
        lastStatus,
        deadLettered: true,
      });
      return;
    }

    const delayMs = computeBackoffMs(attempts, env.WEBHOOKS_BACKOFF_BASE_MS);
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'failed',
        attempts,
        lastStatusCode: statusCode ?? null,
        lastResponse: responseText,
        lastError: errorMessage ?? null,
        nextAttemptAt: new Date(Date.now() + delayMs),
      },
    });
    this.eventEmitter.emit('webhook.delivery.failed', {
      tenantId: delivery.tenantId,
      endpointId: delivery.endpointId,
      deliveryId: delivery.id,
      event: delivery.event,
      attempts,
      lastStatus,
      deadLettered: false,
    });
    await this.webhooksQueue.add(
      'deliver',
      { deliveryId: delivery.id },
      // A jobId containing ':' must split into exactly 3 segments — BullMQ's
      // legacy repeatable-job ID compatibility check (Job.validateOptions) —
      // or Queue.add() throws "Custom Id cannot contain :" and the retry is
      // silently never enqueued. Avoid ':' entirely instead of relying on
      // that arbitrary rule.
      { jobId: `${delivery.id}-attempt-${attempts + 1}`, delay: delayMs },
    );
  }

  private async send(
    url: string,
    event: string,
    deliveryId: string,
    timestamp: number,
    signature: string,
    body: string,
  ): Promise<{
    statusCode?: number;
    responseText: string | null;
    errorMessage?: string;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VerifyNG-Event': event,
          'X-VerifyNG-Delivery': deliveryId,
          'X-VerifyNG-Timestamp': String(timestamp),
          'X-VerifyNG-Signature': signature,
        },
        body,
        signal: controller.signal,
      });
      const text = (await res.text()).slice(0, 2000);
      return { statusCode: res.status, responseText: text };
    } catch (err) {
      return {
        responseText: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
