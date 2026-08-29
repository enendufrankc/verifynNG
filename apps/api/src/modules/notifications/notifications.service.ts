import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OutboxService } from './outbox/outbox.service';
import { SuppressionsService } from './suppressions/suppressions.service';
import { TemplateId, TemplateData } from './templates/template-data';
import { NotificationChannel } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(
    private outboxService: OutboxService,
    private suppressionsService: SuppressionsService,
    @InjectQueue('notifications') private notificationsQueue: Queue,
  ) {}

  async send(
    templateId: TemplateId,
    recipient: { email?: string; phone?: string; userId?: string },
    data: TemplateData[TemplateId],
    opts: {
      tenantId?: string;
      channel?: 'email' | 'sms' | 'whatsapp';
      idempotencyKey?: string;
      locale?: string;
    } = {},
  ): Promise<{ outboxId: string; status: string }> {
    const channel = opts.channel ?? (recipient.email ? 'email' : 'sms');
    const recipientAddress =
      channel === 'email'
        ? recipient.email!
        : channel === 'sms'
          ? recipient.phone!
          : recipient.phone!;

    const suppressed = await this.suppressionsService.isSuppressed(
      channel as NotificationChannel,
      recipientAddress,
    );

    if (suppressed) {
      const result = await this.outboxService.createOutboxRow({
        tenantId: opts.tenantId,
        templateId,
        channel: channel as NotificationChannel,
        recipient: recipientAddress,
        recipientUserId: recipient.userId,
        data: data as object,
        idempotencyKey: opts.idempotencyKey,
      });
      if (result.isDuplicate) {
        return { outboxId: result.id, status: result.status };
      }
      await this.outboxService.markSuppressed(result.id);
      return { outboxId: result.id, status: 'suppressed' };
    }

    const result = await this.outboxService.createOutboxRow({
      tenantId: opts.tenantId,
      templateId,
      channel: channel as NotificationChannel,
      recipient: recipientAddress,
      recipientUserId: recipient.userId,
      data: data as object,
      idempotencyKey: opts.idempotencyKey,
    });

    if (result.isDuplicate) {
      return { outboxId: result.id, status: result.status };
    }

    await this.notificationsQueue.add(
      'deliver',
      { outboxId: result.id },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
      },
    );

    return { outboxId: result.id, status: result.status };
  }

  async retry(outboxId: string): Promise<void> {
    await this.outboxService.retryOutboxRow(outboxId);
    await this.notificationsQueue.add(
      'deliver',
      { outboxId },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
      },
    );
  }
}
