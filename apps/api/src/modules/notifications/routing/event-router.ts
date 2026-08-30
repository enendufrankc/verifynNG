import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, NotificationChannel, TenantRole } from '@prisma/client';
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
    // Subscribe to all known event names
    for (const eventName of Object.keys(EVENT_TEMPLATE_MAP)) {
      this.eventEmitter.on(
        eventName,
        (payload: { tenantId: string; data: object }) => {
          this.handleEvent(eventName, payload.tenantId, payload.data).catch(
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

  /**
   * Resolves tenant members by role via the Membership join table. Tenant
   * membership lives in Membership (userId, tenantId, role), not on User
   * directly — User.tenantId is a separate, unrelated denormalized field that
   * is left null for normal members (only set on some legacy/test fixtures),
   * so querying User.tenantId here silently resolved zero recipients for
   * every real tenant. See E08 issue re: report.received never firing.
   */
  private async resolveMembers(
    tenantId: string,
    roles: string[],
  ): Promise<Array<{ id: string; email: string; phone?: string }>> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        ...(roles.length > 0 ? { role: { in: roles as TenantRole[] } } : {}),
      },
      include: { user: true },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      phone: undefined,
    }));
  }
}
