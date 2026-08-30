import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import type { AlertWebhookPayload } from './alerts.service';

@Controller('internal/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  handleAlertWebhook(
    @Body() payload: AlertWebhookPayload,
    @Headers('authorization') authHeader?: string,
    @Headers('x-alert-secret') secretHeader?: string,
  ) {
    const expectedSecret =
      process.env.ALERT_WEBHOOK_SECRET || 'alert-webhook-secret-local';
    const token = authHeader?.replace(/^Bearer\s+/i, '') || secretHeader;

    if (token && token !== expectedSecret) {
      throw new UnauthorizedException('Invalid alert webhook secret');
    }

    this.alertsService.processAlertWebhook(payload);
    return { status: 'accepted' };
  }
}
