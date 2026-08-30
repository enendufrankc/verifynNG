import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { MigrationsHealthIndicator } from './migrations.health';
import { StorageHealthIndicator } from './storage.health';
import { WorkersHealthIndicator } from './workers.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    PrismaHealthIndicator,
    RedisHealthIndicator,
    MigrationsHealthIndicator,
    StorageHealthIndicator,
    WorkersHealthIndicator,
  ],
  exports: [HealthService],
})
export class HealthModule {}
