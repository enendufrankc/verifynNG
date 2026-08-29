import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, NotificationChannel, SuppressionReason } from '@prisma/client';
import { SuppressionsService } from '../suppressions/suppressions.service';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private fakeWebhookSecret: string;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
    private prisma: PrismaClient,
    private suppressionsService: SuppressionsService,
    private outboxService: OutboxService,
  ) {
    this.fakeWebhookSecret = config.get('FAKE_WEBHOOK_SECRET') ?? 'dev-secret';
  }

  /** Verify fake-mail webhook HMAC signature */
  verifyFakeMailSignature(payload: string, signature: string): boolean {
    const expected = createHmac('sha256', this.fakeWebhookSecret)
      .update(payload)
      .digest('hex');
    return expected === signature;
  }

  /** Process a fake-mail bounce/complaint webhook */
  async handleFakeMailWebhook(body: {
    type: 'bounce' | 'complaint';
    recipient: string;
    reason?: string;
  }) {
    const channel = NotificationChannel.email;

    if (body.type === 'bounce' || body.type === 'complaint') {
      const reason: SuppressionReason =
        body.type === 'bounce' ? 'bounce' : 'complaint';

      await this.suppressionsService.addSuppression({
        channel,
        recipient: body.recipient,
        reason,
        source: 'fake-mail-webhook',
      });

      // Find any outbox row for this recipient and update status
      const outboxRows = await this.prisma.notificationOutbox.findMany({
        where: { recipient: body.recipient, channel, status: { in: ['queued', 'sending'] } },
      });

      for (const row of outboxRows) {
        await this.outboxService.markSuppressed(row.id);
      }

      this.eventEmitter.emit('notification.bounced', {
        channel,
        recipientHash: this.hashRecipient(body.recipient),
        reason: body.type,
        suppressed: true,
      });

      this.logger.log(
        `Suppressed ${body.recipient} due to ${body.type} (fake-mail webhook)`,
      );
    }
  }

  /** Process Resend webhook (svix signature verification) */
  async handleResendWebhook(rawBody: string, _signature: string) {
    // TODO: Implement svix signature verification when RESEND_WEBHOOK_SECRET is available
    // For now, parse and process
    try {
      const event = JSON.parse(rawBody);
      if (event.type === 'email.bounced' || event.type === 'email.complained') {
        const recipient = event.data?.email ?? '';
        const reason: SuppressionReason =
          event.type === 'email.bounced' ? 'bounce' : 'complaint';

        if (recipient) {
          await this.suppressionsService.addSuppression({
            channel: NotificationChannel.email,
            recipient,
            reason,
            source: 'resend-webhook',
          });

          this.eventEmitter.emit('notification.bounced', {
            channel: NotificationChannel.email,
            recipientHash: this.hashRecipient(recipient),
            reason: event.type === 'email.bounced' ? 'bounce' : 'complaint',
            suppressed: true,
          });
        }
      }
    } catch {
      this.logger.error('Failed to parse Resend webhook body');
    }
  }

  /** Process Termii DLR webhook */
  async handleTermiiWebhook(body: { message_id?: string; status?: string }) {
    if (body.message_id) {
      const outboxRow = await this.prisma.notificationOutbox.findFirst({
        where: { providerMessageId: body.message_id },
      });
      if (outboxRow) {
        await this.outboxService.addDeliveryEvent(outboxRow.id, 'delivered', body);
      }
    }
  }

  private hashRecipient(recipient: string): string {
    return createHmac('sha256', 'recipient-hash')
      .update(recipient)
      .digest('hex')
      .slice(0, 16);
  }
}
