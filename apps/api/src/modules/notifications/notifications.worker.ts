import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient, NotificationChannel } from '@prisma/client';
import { OutboxService } from './outbox/outbox.service';
import { TemplateRegistry } from './templates/registry';
import { BrandingResolver } from './routing/branding-resolver';
import { SuppressionsService } from './suppressions/suppressions.service';
import { MAILER } from './ports/mailer.port';
import type { MailerPort } from './ports/mailer.port';
import { SMS } from './ports/sms.port';
import type { SmsPort } from './ports/sms.port';
import { WHATSAPP } from './ports/whatsapp.port';
import type { WhatsAppPort } from './ports/whatsapp.port';
import { Inject, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TemplateData, TemplateId } from './templates/template-data';
import { createHash } from 'node:crypto';

@Processor('notifications')
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private outboxService: OutboxService,
    private templateRegistry: TemplateRegistry,
    private brandingResolver: BrandingResolver,
    private suppressionsService: SuppressionsService,
    @Inject(MAILER) private mailer: MailerPort,
    @Inject(SMS) private sms: SmsPort,
    @Inject(WHATSAPP) private whatsapp: WhatsAppPort,
    private eventEmitter: EventEmitter2,
    private prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<{ outboxId: string }>): Promise<void> {
    const { outboxId } = job.data;
    this.logger.log(`Processing delivery for outbox ${outboxId}`);

    const row = await this.outboxService.getOutboxRow(outboxId);
    if (!row) {
      this.logger.warn(`Outbox row ${outboxId} not found`);
      return;
    }

    if (row.status === 'sent' || row.status === 'suppressed') {
      this.logger.log(`Outbox row ${outboxId} already ${row.status}, skipping`);
      return;
    }

    await this.outboxService.markSending(outboxId);

    try {
      const suppressed = await this.suppressionsService.isSuppressed(
        row.channel,
        row.recipient,
      );
      if (suppressed) {
        await this.outboxService.markSuppressed(outboxId);
        await this.outboxService.addDeliveryEvent(outboxId, 'failed', {
          reason: 'suppressed',
        });
        this.logger.log(
          `Recipient ${row.recipient} is suppressed, marking suppressed`,
        );
        return;
      }

      const branding = await this.brandingResolver.for(
        row.tenantId ?? undefined,
      );

      const rendered = this.templateRegistry.render(
        row.templateId as TemplateId,
        row.data as TemplateData[TemplateId],
        branding,
      );

      await this.prisma.notificationOutbox.update({
        where: { id: outboxId },
        data: { renderedSubject: rendered.subject },
      });

      let providerMessageId: string;

      if (row.channel === NotificationChannel.email) {
        const mailResult = await this.mailer.send({
          to: row.recipient,
          from: branding.sender,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          tags: [row.templateId],
        });
        providerMessageId = mailResult.providerMessageId;
      } else if (row.channel === NotificationChannel.sms) {
        const smsResult = await this.sms.send({
          to: row.recipient,
          body: rendered.sms,
        });
        providerMessageId = smsResult.providerMessageId;
      } else if (row.channel === NotificationChannel.whatsapp) {
        const waResult = await this.whatsapp.sendTemplate({
          to: row.recipient,
          template: rendered.whatsapp?.template ?? row.templateId,
          params: rendered.whatsapp?.params ?? {},
        });
        providerMessageId = waResult.providerMessageId;
      } else {
        throw new Error(`Unknown channel: ${row.channel}`);
      }

      await this.outboxService.markSent(outboxId, providerMessageId);
      await this.outboxService.addDeliveryEvent(outboxId, 'sent', {
        providerMessageId,
      });

      this.eventEmitter.emit('notification.sent', {
        outboxId,
        tenantId: row.tenantId,
        templateId: row.templateId,
        channel: row.channel,
        recipientHash: NotificationWorker.hashRecipient(row.recipient),
        providerMessageId,
      });

      this.logger.log(`Delivered ${outboxId} via ${row.channel}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Delivery failed for ${outboxId}: ${errMsg}`);

      const updated = await this.outboxService.markFailed(outboxId, errMsg);
      await this.outboxService.addDeliveryEvent(outboxId, 'failed', {
        error: errMsg,
        attempt: updated?.attempts,
      });

      if (updated?.status === 'failed') {
        this.eventEmitter.emit('notification.failed', {
          outboxId,
          tenantId: row.tenantId,
          templateId: row.templateId,
          channel: row.channel,
          attempts: updated.attempts,
          lastError: errMsg,
        });
      } else {
        throw error;
      }
    }
  }

  private static hashRecipient(recipient: string): string {
    return createHash('sha256').update(recipient).digest('hex').slice(0, 16);
  }
}
