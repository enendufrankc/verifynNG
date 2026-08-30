import { Module } from '@nestjs/common';
import { EventsModule } from './common/events.module';
import { PrismaModule } from './common/prisma.module';
import { S3Module } from './common/s3.module';
import { BullMQModule } from './jobs/bullmq.module';
import { BatchExportsProcessor } from './jobs/batch-exports.processor';
import { MintProcessor } from './jobs/mint.processor';
import { ManifestService } from './modules/batches/manifest.service';

/**
 * Runtime module for queue consumers.
 *
 * Keep HTTP controllers and request middleware out of this graph: the worker
 * has one responsibility, consuming BullMQ jobs.
 */
@Module({
  imports: [PrismaModule, S3Module, EventsModule, BullMQModule],
  providers: [ManifestService, MintProcessor, BatchExportsProcessor],
})
export class WorkerModule {}
