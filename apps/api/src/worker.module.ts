import { Module } from '@nestjs/common';
import { EventsModule } from './common/events.module';
import { PrismaModule } from './common/prisma.module';
import { S3Module } from './common/s3.module';
import { BullMQModule } from './jobs/bullmq.module';
import { BatchExportsProcessor } from './jobs/batch-exports.processor';
import { MintProcessor } from './jobs/mint.processor';
import { ManifestService } from './modules/batches/manifest.service';
import { DatabaseModule } from './modules/database/database.module';
import { AuditModule } from './modules/audit/audit.module.js';
import { RulesService } from './modules/anomaly/rules/rules.service';
import { AnomalyEngine } from './modules/anomaly/anomaly-engine.service';
import { AnomalyQueueProcessor } from './modules/anomaly/consumers/anomaly-queue.processor';
import { SweepSchedulerService } from './modules/anomaly/consumers/sweep-scheduler.service';
import { UnitLifecycleService } from './modules/units/unit-lifecycle.service';
import { RecallProcessor } from './modules/units/recall.processor';

/**
 * Runtime module for queue consumers.
 *
 * Keep HTTP controllers and request middleware out of this graph: the worker
 * has one responsibility, consuming BullMQ jobs. This is a separate Nest
 * application context (see worker.ts) — `@Global()` modules from AppModule
 * (DatabaseModule, AuditModule) must be imported here explicitly too.
 */
@Module({
  imports: [
    PrismaModule,
    S3Module,
    EventsModule,
    BullMQModule,
    DatabaseModule,
    AuditModule,
  ],
  providers: [
    ManifestService,
    MintProcessor,
    BatchExportsProcessor,
    RulesService,
    AnomalyEngine,
    AnomalyQueueProcessor,
    SweepSchedulerService,
    UnitLifecycleService,
    RecallProcessor,
  ],
})
export class WorkerModule {}
