import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, NotificationChannel } from '@prisma/client';
import { NotificationService } from '../notifications.service';
import { TemplateId } from '../templates/template-data';

// Maps event names to their default template IDs
const EVENT_TEMPLATE_MAP: Record<string, TemplateId> = {
  'anomaly.detected': 'anomaly.alert',
  'report.created': 'report.received',
  'batch.minted': 'batch.minted',
  'manifest.delivered': 'manifest.delivered',
  'receipt.mismatch': 'receipt.mismatch',
  'tenant.activated': 'tenant.welcome',
  'invoice.issued': 'invoice.issued',
  'invoice.paid': 'invoice.paid',
  'invoice.failed': 'invoice.failed',
};

@Injectable()
export class EventRouter implements OnModuleInit {
  constructor(
    private eventEmitter: EventEmitter2,
    private prisma: PrismaClient,
    private notificationService: NotificationService,
  ) {}

  onModuleInit() {
    // Subscribe to all known event names. Every domain event in this codebase
    // (batch.minted, anomaly.detected, ...) is emitted as one flat object
    // carrying `tenantId` alongside its own fields — not `{tenantId, data}` —
    // so the whole payload IS the template data.
    for (const eventName of Object.keys(EVENT_TEMPLATE_MAP)) {
      this.eventEmitter.on(
        eventName,
        (payload: { tenantId: string } & Record<string, unknown>) => {
          this.handleEvent(eventName, payload.tenantId, payload).catch(
            (err) => {
              console.error(`EventRouter error handling ${eventName}:`, err);
            },
          );
        },
      );
    }
  }

  async dispatch(eventName: string, tenantId: string, data: object) {
    await this.handleEvent(eventName, tenantId, data);
  }

  private async handleEvent(eventName: string, tenantId: string, data: object) {
    // Find enabled routing rules for this event and tenant
    const rules = await this.prisma.notificationRoutingRule.findMany({
      where: {
        tenantId,
        eventName,
        enabled: true,
      },
    });

    if (rules.length === 0) return;

    // Resolve members by roles (stubbed until E02 lands)
    for (const rule of rules) {
      const members = await this.resolveMembers(tenantId, rule.roles);
      const templateId = rule.templateId as TemplateId;

      for (const member of members) {
        for (const channel of rule.channels) {
          const recipient =
            channel === NotificationChannel.email ? member.email : member.phone;
          if (!recipient) continue;

          await this.notificationService.send(
            templateId,
            { email: member.email, phone: member.phone, userId: member.id },
            data as never,
            {
              tenantId,
              channel: channel as 'email' | 'sms' | 'whatsapp',
            },
          );
        }
      }
    }
  }

  /** Stub: resolves members by roles until E02 ships UsersService.listMembers */
  private async resolveMembers(
    tenantId: string,
    roles: string[],
  ): Promise<Array<{ id: string; email: string; phone?: string }>> {
    // For now, return all users in the tenant (role filtering comes with E02)
    const users = await this.prisma.user.findMany({
      where: { tenantId },
    });

    // If roles includes 'owner', we return all users as a stub
    // E02 will provide proper role-based filtering
    if (roles.length === 0) return users;

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: undefined,
    }));
  }
}
