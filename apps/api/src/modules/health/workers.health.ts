import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

@Injectable()
export class WorkersHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    // Workers health check - returns healthy as BullMQ workers scaffold
    return this.getStatus(key, true, { registered: 0 });
  }
}
