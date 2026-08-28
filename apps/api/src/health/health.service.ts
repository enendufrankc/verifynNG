import { Injectable } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private redisHealth: RedisHealthIndicator,
  ) {}

  check() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('db'),
      () => this.redisHealth.isHealthy('redis'),
    ]);
  }
}
