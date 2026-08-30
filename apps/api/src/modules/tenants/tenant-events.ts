import { Injectable, Logger } from '@nestjs/common';

export type TenantEventName =
  | 'tenant.created'
  | 'tenant.submitted'
  | 'tenant.verified'
  | 'tenant.rejected'
  | 'tenant.suspended'
  | 'tenant.reactivated'
  | 'tenant.offboarded'
  | 'tenant.exported'
  | 'tenant.deleted'
  | 'policy.accepted';

@Injectable()
export class TenantEventBus {
  private readonly logger = new Logger(TenantEventBus.name);

  emit(name: TenantEventName, payload: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event: name, ...payload }));
  }
}
