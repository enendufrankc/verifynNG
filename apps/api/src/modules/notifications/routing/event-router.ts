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
   * Resolves members by role for a tenant. Tenant membership lives on
   * `Membership` (users can belong to multiple tenants), not `User.tenantId`
   * — that field is unset for every user created via the normal signup/seed
   * path, so a `User.findMany({where:{tenantId}})` stub here previously
   * matched zero rows for every real tenant, meaning no routed event has
   * ever actually reached a recipient (see the CROSS-EPIC-REQUESTS.md ask
   * for `UsersService.listMembers` — this was the interim stub for that,
   * written against a User-based model E02 didn't ship).
   */
  private async resolveMembers(
    tenantId: string,
    roles: string[],
  ): Promise<Array<{ id: string; email: string; phone?: string }>> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        ...(roles.length ? { role: { in: roles as TenantRole[] } } : {}),
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
