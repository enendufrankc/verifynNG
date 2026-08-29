import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { NotificationService } from './notifications.service';
import { OutboxService } from './outbox/outbox.service';
import { SuppressionsService } from './suppressions/suppressions.service';
import { WebhooksService } from './webhooks/webhooks.service';
import { EventRouter } from './routing/event-router';
import { PrismaClient, NotificationChannel, SuppressionReason } from '@prisma/client';
import { TenantId } from '../../common/tenant-id.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('v1/notifications')
export class NotificationsController {
  constructor(
    private notificationService: NotificationService,
    private outboxService: OutboxService,
    private suppressionsService: SuppressionsService,
    private prisma: PrismaClient,
  ) {}

  @Get('rules')
  async getRules(@TenantId() tenantId: string) {
    return this.prisma.notificationRoutingRule.findMany({
      where: { tenantId },
      orderBy: { eventName: 'asc' },
    });
  }

  @Put('rules')
  async putRules(
    @TenantId() tenantId: string,
    @Body()
    body: Array<{
      eventName: string;
      templateId: string;
      channels: NotificationChannel[];
      roles: string[];
      enabled?: boolean;
    }>,
  ) {
    await this.prisma.notificationRoutingRule.deleteMany({
      where: { tenantId },
    });

    const created = await Promise.all(
      body.map((rule) =>
        this.prisma.notificationRoutingRule.create({
          data: {
            tenantId,
            eventName: rule.eventName,
            templateId: rule.templateId,
            channels: rule.channels,
            roles: rule.roles,
            enabled: rule.enabled ?? true,
          },
        }),
      ),
    );

    return created;
  }

  @Get('outbox')
  async getOutbox(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('templateId') templateId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.outboxService.listOutbox({
      tenantId,
      status: status as never,
      channel: channel as never,
      templateId,
      cursor,
    });
  }

  @Post('outbox/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryOutbox(@Param('id') id: string) {
    await this.outboxService.retryOutboxRow(id);
    return { ok: true };
  }

  @Get('suppressions')
  async getSuppressions(
    @TenantId() tenantId: string,
    @Query('channel') channel?: string,
  ) {
    return this.suppressionsService.listSuppressions({
      tenantId,
      channel: channel as never,
    });
  }

  @Post('suppressions')
  async addSuppression(
    @TenantId() tenantId: string,
    @Body()
    body: {
      channel: NotificationChannel;
      recipient: string;
      reason: SuppressionReason;
    },
  ) {
    return this.suppressionsService.addSuppression({
      tenantId,
      channel: body.channel,
      recipient: body.recipient,
      reason: body.reason,
      source: 'manual',
    });
  }

  @Delete('suppressions/:id')
  async removeSuppression(@Param('id') id: string) {
    await this.suppressionsService.removeSuppression(id);
    return { ok: true };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async sendTest(
    @TenantId() tenantId: string,
    @Body() body: { channel?: 'email' | 'sms' },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { tenantId },
    });
    if (!user) {
      return { error: 'No user found for this tenant' };
    }

    const channel = body.channel ?? 'email';
    const recipient =
      channel === 'email'
        ? { email: user.email }
        : { phone: '+2348000000001' };

    return this.notificationService.send(
      'notification.test',
      recipient,
      {
        message: 'Test notification from admin console',
        timestamp: new Date().toISOString(),
      } as never,
      { tenantId, channel },
    );
  }
}

@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Post('fake-mail')
  @HttpCode(HttpStatus.OK)
  async fakeMailWebhook(
    @Body()
    body: {
      type: 'bounce' | 'complaint';
      recipient: string;
      reason?: string;
    },
  ) {
    await this.webhooksService.handleFakeMailWebhook(body);
    return { ok: true };
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  async resendWebhook(@Req() req: Request) {
    const raw = JSON.stringify(req.body);
    const sig = req.headers['svix-signature'] as string;
    await this.webhooksService.handleResendWebhook(raw, sig);
    return { ok: true };
  }

  @Post('termii')
  @HttpCode(HttpStatus.OK)
  async termiiWebhook(
    @Body() body: { message_id?: string; status?: string },
  ) {
    await this.webhooksService.handleTermiiWebhook(body);
    return { ok: true };
  }
}

@Controller('v1/_dev')
export class DevController {
  constructor(
    private notificationService: NotificationService,
    private eventRouter: EventRouter,
    private prisma: PrismaClient,
    private config: ConfigService,
  ) {}

  @Post('notify')
  @HttpCode(HttpStatus.OK)
  async devNotify(
    @Body()
    body: {
      templateId: string;
      email?: string;
      phone?: string;
      channel?: 'email' | 'sms';
      idempotencyKey?: string;
    },
  ) {
    if (this.config.get('NODE_ENV') === 'production') {
      return { error: 'Dev endpoints not available in production' };
    }

    const channel = body.channel ?? (body.email ? 'email' : 'sms');
    const recipient =
      channel === 'email'
        ? { email: body.email ?? 'dev@verifyn.ng' }
        : { phone: body.phone ?? '+2348000000001' };

    return this.notificationService.send(
      body.templateId as never,
      recipient,
      {
        message: 'Dev test notification',
        timestamp: new Date().toISOString(),
      } as never,
      { channel, idempotencyKey: body.idempotencyKey },
    );
  }

  @Post('emit')
  @HttpCode(HttpStatus.OK)
  async devEmit(
    @Body()
    body: { event: string; tenantId?: string; data?: object },
  ) {
    if (this.config.get('NODE_ENV') === 'production') {
      return { error: 'Dev endpoints not available in production' };
    }

    const tenantId =
      body.tenantId ??
      (
        await this.prisma.tenant.findFirst({ where: { slug: 'ivoryglow' } })
      )?.id;

    if (!tenantId) {
      return { error: 'No tenant found' };
    }

    await this.eventRouter.dispatch(body.event, tenantId, body.data ?? {});
    return { ok: true, tenantId, event: body.event };
  }
}
