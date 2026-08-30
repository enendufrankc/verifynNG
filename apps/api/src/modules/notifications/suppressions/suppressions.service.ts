import { Injectable } from '@nestjs/common';
import {
  PrismaClient,
  NotificationChannel,
  SuppressionReason,
} from '@prisma/client';

@Injectable()
export class SuppressionsService {
  constructor(private prisma: PrismaClient) {}

  async isSuppressed(
    channel: NotificationChannel,
    recipient: string,
  ): Promise<boolean> {
    const row = await this.prisma.notificationSuppression.findUnique({
      where: { channel_recipient: { channel, recipient } },
    });
    return row !== null;
  }

  async addSuppression(params: {
    tenantId?: string;
    channel: NotificationChannel;
    recipient: string;
    reason: SuppressionReason;
    source: string;
  }) {
    return this.prisma.notificationSuppression.upsert({
      where: {
        channel_recipient: {
          channel: params.channel,
          recipient: params.recipient,
        },
      },
      create: params,
      update: { reason: params.reason, source: params.source },
    });
  }

  async removeSuppression(id: string) {
    return this.prisma.notificationSuppression.delete({ where: { id } });
  }

  async listSuppressions(params: {
    tenantId?: string;
    channel?: NotificationChannel;
  }) {
    const where: Record<string, unknown> = {};
    // Suppressions are keyed on [channel, recipient] and apply platform-wide
    // (tenantId is null for provider-webhook bounces); a tenant view must
    // include both its own manual suppressions and the global ones.
    if (params.tenantId)
      where.OR = [{ tenantId: params.tenantId }, { tenantId: null }];
    if (params.channel) where.channel = params.channel;
    return this.prisma.notificationSuppression.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
