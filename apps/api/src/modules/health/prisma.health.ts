import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { prisma } from '@verifynng/db';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch {
      return this.getStatus(key, false);
    }
  }
}
