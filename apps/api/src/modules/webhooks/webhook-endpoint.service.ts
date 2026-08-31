import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, WebhookEndpoint } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import crypto from 'node:crypto';
import { WebhookUrlValidator } from './webhook-url-validator.js';
import { encryptWebhookSecret } from './webhook-secret-crypto.js';
import { isValidEventSelection } from './event-catalogue.js';
import {
  toPublicWebhookEndpoint,
  type PublicWebhookEndpoint,
} from './webhook-endpoint.mapper.js';
import {
  ENTITLEMENT_SERVICE,
  type EntitlementService,
} from '../entitlements/entitlement.service.js';

function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

@Injectable()
export class WebhookEndpointService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly urlValidator: WebhookUrlValidator,
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
    @Inject(ENTITLEMENT_SERVICE)
    private readonly entitlements: EntitlementService,
  ) {}

  private assertValidEvents(events: string[]): void {
    if (!isValidEventSelection(events)) {
      throw new BadRequestException({
        type: 'validation',
        message:
          'events must be a non-empty subset of the event catalogue, or ["*"]',
        details: [{ field: 'events', issue: 'invalid event selection' }],
      });
    }
  }

  async create(
    tenantId: string,
    input: { url: string; events: string[]; description?: string },
  ): Promise<{ endpoint: PublicWebhookEndpoint; secret: string }> {
    const hasFeature = await this.entitlements.hasFeature(tenantId, 'webhooks');
    if (!hasFeature) {
      throw new HttpException(
        { error: 'plan_limit', reason: 'webhooks is not on this plan' },
        402,
      );
    }
    await this.urlValidator.assertSafe(input.url);
    this.assertValidEvents(input.events);

    const secret = generateSecret();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        url: input.url,
        events: input.events,
        description: input.description,
        secretEnc: encryptWebhookSecret(secret),
      },
    });

    return { endpoint: toPublicWebhookEndpoint(endpoint), secret };
  }

  async list(tenantId: string): Promise<PublicWebhookEndpoint[]> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return endpoints.map(toPublicWebhookEndpoint);
  }

  async get(tenantId: string, id: string): Promise<PublicWebhookEndpoint> {
    const endpoint = await this.findOrThrow(tenantId, id);
    return toPublicWebhookEndpoint(endpoint);
  }

  async update(
    tenantId: string,
    id: string,
    input: {
      url?: string;
      events?: string[];
      description?: string;
      status?: 'active' | 'disabled';
    },
  ): Promise<PublicWebhookEndpoint> {
    await this.findOrThrow(tenantId, id);
    if (input.url) await this.urlValidator.assertSafe(input.url);
    if (input.events) this.assertValidEvents(input.events);

    const endpoint = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.url ? { url: input.url } : {}),
        ...(input.events ? { events: input.events } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });
    return toPublicWebhookEndpoint(endpoint);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findOrThrow(tenantId, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async rotateSecret(
    tenantId: string,
    id: string,
  ): Promise<{ secret: string }> {
    await this.findOrThrow(tenantId, id);
    const secret = generateSecret();
    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secretEnc: encryptWebhookSecret(secret) },
    });
    return { secret };
  }

  /** Enqueues a signed `ping` delivery — the processor (T10) does the actual send. */
  async testSend(
    tenantId: string,
    id: string,
  ): Promise<{ deliveryId: string }> {
    const endpoint = await this.findOrThrow(tenantId, id);
    if (endpoint.status === 'disabled') {
      throw new ConflictException('endpoint is disabled');
    }

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        tenantId,
        endpointId: endpoint.id,
        event: 'ping',
        payload: {},
      },
    });

    await this.webhooksQueue.add(
      'deliver',
      { deliveryId: delivery.id },
      { jobId: delivery.id },
    );

    return { deliveryId: delivery.id };
  }

  private async findOrThrow(
    tenantId: string,
    id: string,
  ): Promise<WebhookEndpoint> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
    });
    if (!endpoint) throw new NotFoundException();
    return endpoint;
  }
}
