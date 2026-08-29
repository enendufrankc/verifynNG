import { Injectable } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { MigrationsHealthIndicator } from './migrations.health';
import { StorageHealthIndicator } from './storage.health';
import { WorkersHealthIndicator } from './workers.health';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private migrationsHealth: MigrationsHealthIndicator,
    private storageHealth: StorageHealthIndicator,
    private workersHealth: WorkersHealthIndicator,
  ) {}

  getLiveness() {
    return {
      status: 'ok',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('db'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.storageHealth.isHealthy('storage'),
      () => this.workersHealth.isHealthy('workers'),
    ]);
  }
}
