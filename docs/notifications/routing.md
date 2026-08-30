# Notification routing

An epic that emits a notification event should:

1. Document the event name and payload, including `tenantId`, in its epic file.
2. Add a typed template id and data contract to `apps/api/src/modules/notifications/templates/`.
3. Add or update a default `NotificationRoutingRule` in `packages/db/prisma/seed.ts` when the event should be enabled for new tenants.
4. Emit the domain event and let `EventRouter` resolve members and call `NotificationService.send()`.

Routing is tenant-scoped. Rules select a template, one or more channels, and member roles. Delivery remains asynchronous through the notifications outbox, so producers should not call provider adapters directly.

Template payloads must be redacted before they reach the registry: tier-2 codes and raw manifests must never be included in notification data.
