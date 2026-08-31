import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, WebhookDeliveryStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  paginate,
  parseLimit,
  decodeCursor,
  type CursorPage,
} from '../public-api/pagination.js';

export interface PublicWebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

function toPublicDelivery(row: {
  id: string;
  endpointId: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}): PublicWebhookDelivery {
  return {
    id: row.id,
    endpointId: row.endpointId,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class WebhookDeliveryService {
  constructor(
    private readonly prisma: PrismaClient,
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
  ) {}

  async list(
    tenantId: string,
    query: {
      endpointId?: string;
      status?: WebhookDeliveryStatus;
      cursor?: string;
      limit?: string;
    },
  ): Promise<CursorPage<PublicWebhookDelivery>> {
    const limit = parseLimit(query.limit);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        tenantId,
        ...(query.endpointId ? { endpointId: query.endpointId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = paginate(rows, limit);
    return {
      data: page.data.map(toPublicDelivery),
      nextCursor: page.nextCursor,
    };
  }

  /** Resets attempts/status and re-enqueues immediately, ignoring backoff. */
  async redeliver(
    tenantId: string,
    id: string,
  ): Promise<{ deliveryId: string }> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id, tenantId },
    });
    if (!delivery) throw new NotFoundException();
    if (delivery.status === 'pending' || delivery.status === 'delivering') {
      throw new ConflictException('delivery is already in flight');
    }

    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: null,
        lastStatusCode: null,
        lastError: null,
      },
    });
    await this.webhooksQueue.add(
      'deliver',
      { deliveryId: id },
      { jobId: `${id}:redeliver:${Date.now()}` },
    );
    return { deliveryId: id };
  }
}
