import { Injectable } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';

/**
 * The epic doc calls this a "FakeClock provider" — a day-duration
 * abstraction every billing duration (invoice due date, dunning retry
 * offsets) goes through, so `BILLING_CLOCK_SKEW_SECONDS` can compress
 * "days" into seconds for tests/demos (AC5's dunning-to-restricted flow)
 * without every call site re-deriving the same env-driven arithmetic.
 * `BILLING_CLOCK_SKEW_SECONDS=0` (default) means real days.
 */
@Injectable()
export class BillingClock {
  now(): Date {
    return new Date();
  }

  daysToMs(days: number): number {
    const skewSeconds = loadEnv().BILLING_CLOCK_SKEW_SECONDS;
    return skewSeconds > 0
      ? days * skewSeconds * 1000
      : days * 24 * 60 * 60 * 1000;
  }

  addDays(from: Date, days: number): Date {
    return new Date(from.getTime() + this.daysToMs(days));
  }
}
