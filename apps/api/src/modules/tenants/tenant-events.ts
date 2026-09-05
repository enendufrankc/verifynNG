import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

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

  // Explicit @Inject(EventEmitter2) skipped — this constructor is
  // single-param and NestJS resolves it fine even under tsx (see other
  // modules' comments on that gap for multi-param constructors).
  constructor(private readonly emitter: EventEmitter2) {}

  emit(name: TenantEventName, payload: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event: name, ...payload }));
    // Previously log-only — no listener anywhere could actually react to a
    // tenant status change (E15 needs `tenant.verified` to start a trial;
    // E14's EventRouter has carried a dead `tenant.activated` mapping since
    // it shipped, for the same reason). Additive: no existing `@OnEvent`
    // listener for any `tenant.*` name exists yet, so this has no effect on
    // current behaviour beyond making the event real.
    this.emitter.emit(name, payload);
  }
}
