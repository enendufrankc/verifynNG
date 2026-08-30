import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  NotificationChannel,
  OutboxStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

export function deriveIdempotencyKey(
  templateId: string,
  recipient: string,
  data: object,
): string {
  const hour = new Date().toISOString().slice(0, 13);
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const hash = createHash('sha256')
    .update(`${templateId}|${recipient}|${canonical}|${hour}`)
    .digest('hex');
  return hash;
}

@Injectable()
export class OutboxService {
  constructor(private prisma: PrismaClient) {}

  async createOutboxRow(params: {
    tenantId?: string;
    templateId: string;
    channel: NotificationChannel;
    recipient: string;
    recipientUserId?: string;
    data: object;
    renderedSubject?: string;
    idempotencyKey?: string;
  }): Promise<{ id: string; status: OutboxStatus; isDuplicate: boolean }> {
    const key =
      params.idempotencyKey ??
      deriveIdempotencyKey(params.templateId, params.recipient, params.data);

    const existing = await this.prisma.notificationOutbox.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      return { id: existing.id, status: existing.status, isDuplicate: true };
    }

    const row = await this.prisma.notificationOutbox.create({
      data: {
        tenantId: params.tenantId,
        templateId: params.templateId,
        channel: params.channel,
        recipient: params.recipient,
        recipientUserId: params.recipientUserId,
        data: params.data as Prisma.InputJsonValue,
        renderedSubject: params.renderedSubject,
        idempotencyKey: key,
        status: OutboxStatus.queued,
      },
    });

    await this.addDeliveryEvent(row.id, 'queued');

    return { id: row.id, status: row.status, isDuplicate: false };
  }

  async getOutboxRow(id: string) {
    return this.prisma.notificationOutbox.findUnique({
      where: { id },
      include: { events: true },
    });
  }

  async listOutbox(params: {
    tenantId?: string;
    status?: OutboxStatus;
    channel?: NotificationChannel;
    templateId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.status) where.status = params.status;
    if (params.channel) where.channel = params.channel;
    if (params.templateId) where.templateId = params.templateId;

    const limit = params.limit ?? 50;

    const rows = await this.prisma.notificationOutbox.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
    });

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, -1) : rows;

    return {
      items,
      nextCursor: hasNext ? items[items.length - 1]?.id : null,
    };
  }

  async markSending(id: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: { status: OutboxStatus.sending },
    });
  }

  async markSent(id: string, providerMessageId: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        status: OutboxStatus.sent,
        providerMessageId,
        sentAt: new Date(),
      },
    });
  }

  async markFailed(id: string, error: string) {
    const row = await this.prisma.notificationOutbox.findUnique({
      where: { id },
    });
    if (!row) return null;
    const attempts = row.attempts + 1;
    const maxAttempts = 5;

    const isFinal = attempts >= maxAttempts;
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        status: isFinal ? OutboxStatus.failed : OutboxStatus.queued,
        attempts,
        lastError: error,
      },
    });
  }

  async markSuppressed(id: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: { status: OutboxStatus.suppressed },
    });
  }

  async addDeliveryEvent(
    outboxId: string,
    type: string,
    providerPayload?: object,
  ) {
    return this.prisma.notificationDeliveryEvent.create({
      data: {
        outboxId,
        type: type as never,
        providerPayload: providerPayload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async retryOutboxRow(id: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        status: OutboxStatus.queued,
        lastError: null,
        scheduledAt: new Date(),
      },
    });
  }
}
