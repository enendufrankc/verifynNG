import {
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { Public } from '../../common/tenant';
import {
  PAYMENT_GATEWAY_PORT,
  type PaymentGatewayPort,
} from './payment-gateway.port';

@Controller('v1/billing/webhooks')
export class BillingWebhooksController {
  constructor(
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @InjectQueue('billing') private readonly billingQueue: Queue,
  ) {}

  // No auth — Paystack (and the fake) authenticate via the HMAC signature,
  // not a JWT (see docs/epics/E15-billing-entitlements.md Interfaces: "not
  // needed — webhooks are signature-authenticated, not JWT"). Needs
  // req.rawBody (main.ts's `rawBody: true`), never the JSON-reserialised
  // body other webhook handlers in this codebase use — that isn't
  // guaranteed to byte-match what the provider actually signed.
  @Public()
  @Post('paystack')
  @HttpCode(200)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: true }> {
    const rawBody = req.rawBody ?? Buffer.from('');
    const signature = req.headers['x-paystack-signature'];
    if (
      typeof signature !== 'string' ||
      !this.gateway.verifyWebhookSignature(rawBody, signature)
    ) {
      throw new UnauthorizedException('invalid_webhook_signature');
    }

    const parsed = this.gateway.parseWebhook(rawBody);
    const providerId = (parsed.data as { id?: number | string })?.id;
    // Paystack: idempotency key is `data.id` + event type (CROSS-EPIC/epic
    // doc). Falls back to reference+type for a payload with no `data.id`
    // (shouldn't happen against real Paystack, but the fake's payloads are
    // hand-rolled — keep this defensive rather than crash the webhook).
    // `-`, not `:` — BullMQ rejects a custom jobId containing a colon
    // unless it splits into exactly 3 parts (a legacy repeatable-job
    // format check; see mint.service.ts's batch.id-as-jobId comment for
    // the same gotcha), and this id doubles as the BullMQ jobId below.
    const eventId = `${providerId ?? parsed.reference}-${parsed.type}`;

    const existing = await this.prisma.gatewayWebhookEvent.findUnique({
      where: { id: eventId },
    });
    if (existing) {
      // Already seen (and already enqueued/processed) — ack without
      // creating a second event or a second processing job.
      return { ok: true };
    }

    await this.prisma.gatewayWebhookEvent.create({
      data: {
        id: eventId,
        provider: 'paystack',
        type: parsed.type,
        reference: parsed.reference,
        rawBody: JSON.parse(rawBody.toString('utf8')),
      },
    });
    await this.billingQueue.add(
      'process-webhook',
      { eventId },
      { jobId: eventId },
    );

    return { ok: true };
  }
}
