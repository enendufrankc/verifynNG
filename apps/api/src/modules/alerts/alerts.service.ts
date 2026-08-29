import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface AlertWebhookPayload {
  status: 'firing' | 'resolved';
  alerts: Array<{
    status: 'firing' | 'resolved';
    labels: Record<string, string>;
    annotations: Record<string, string>;
    startsAt: string;
    endsAt?: string;
  }>;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  processAlertWebhook(payload: AlertWebhookPayload): void {
    if (!payload.alerts || !Array.isArray(payload.alerts)) return;

    for (const alert of payload.alerts) {
      const alertName =
        alert.labels.alertname || alert.labels.title || 'UnknownAlert';
      const severity = (alert.labels.severity as 'page' | 'ticket') || 'ticket';
      const summary = alert.annotations.summary || 'No summary provided';

      if (alert.status === 'firing') {
        const eventPayload = {
          alertName,
          severity,
          summary,
          labels: alert.labels,
          firingSince: alert.startsAt,
        };

        this.logger.warn(
          `[Alert Fired] ${alertName} (${severity}): ${summary}`,
        );
        this.eventEmitter.emit('ops.alert.fired', eventPayload);

        // Stub E14 NotificationService dispatch log
        this.logger.log(
          `[E14 NotificationStub] Sending ops.alert email to ${process.env.OPS_ALERT_EMAILS || 'ops@verifynng.local'} for ${alertName}`,
        );
      } else if (alert.status === 'resolved') {
        const eventPayload = {
          alertName,
          resolvedAt: alert.endsAt || new Date().toISOString(),
        };

        this.logger.log(`[Alert Resolved] ${alertName}`);
        this.eventEmitter.emit('ops.alert.resolved', eventPayload);
      }
    }
  }
}
