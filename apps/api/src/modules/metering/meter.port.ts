import { UsageKind } from '@prisma/client';

export { UsageKind };

/** DI token — inject with `@Inject(METER_PORT) private readonly meter: MeterPort`. */
export const METER_PORT = Symbol('METER_PORT');

export interface MeterInput {
  tenantId: string;
  kind: UsageKind;
  quantity: number;
  occurredAt?: Date;
  ref?: string;
  /**
   * Dedup key, unique per (tenantId, kind). Callers metering off an upstream
   * domain event should pass that event's id — MeteringService.record() is
   * only idempotent when this is set (a missing key writes every call).
   */
  idempotencyKey?: string;
}

/** The only sanctioned way for another module to meter usage. */
export interface MeterPort {
  record(input: MeterInput): Promise<void>;
}
