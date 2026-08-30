import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import {
  DsarProcessor,
  ConsumerFulfilJob,
  TenantExportJob,
} from './dsar.processor';

export const DSAR_QUEUE_NAME = 'dsar';

@Injectable()
export class DsarQueue implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly worker?: Worker;

  constructor(config: ConfigService, processor: DsarProcessor) {
    const connection = {
      url: config.get<string>('REDIS_URL'),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue(DSAR_QUEUE_NAME, { connection });
    if (config.get<boolean>('WORKER_INLINE', true)) {
      this.worker = new Worker(
        DSAR_QUEUE_NAME,
        async (job) => {
          if (job.name === 'consumer-export') {
            await processor.fulfilConsumerExport(job.data as ConsumerFulfilJob);
          } else if (job.name === 'consumer-erase') {
            await processor.fulfilConsumerErase(job.data as ConsumerFulfilJob);
          } else if (job.name === 'tenant-export') {
            await processor.fulfilTenantExport(job.data as TenantExportJob);
          }
        },
        { connection },
      );
    }
  }

  async enqueueConsumerExport(job: ConsumerFulfilJob): Promise<void> {
    await this.queue.add('consumer-export', job);
  }

  async enqueueConsumerErase(job: ConsumerFulfilJob): Promise<void> {
    await this.queue.add('consumer-erase', job);
  }

  async enqueueTenantExport(job: TenantExportJob): Promise<void> {
    await this.queue.add('tenant-export', job);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
