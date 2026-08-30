import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { TenantOffboardingProcessor } from './tenant-offboarding.processor';

export const TENANT_OFFBOARDING_QUEUE_NAME = 'tenant-offboarding';

export interface TenantOffboardingExportJob {
  tenantId: string;
  exportId: string;
}
export interface TenantOffboardingDeleteJob {
  tenantId: string;
}

@Injectable()
export class TenantOffboardingQueue implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly worker?: Worker;

  constructor(config: ConfigService, processor: TenantOffboardingProcessor) {
    const connection = {
      url: config.get<string>('REDIS_URL'),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue(TENANT_OFFBOARDING_QUEUE_NAME, { connection });
    if (config.get<boolean>('WORKER_INLINE', true)) {
      this.worker = new Worker(
        TENANT_OFFBOARDING_QUEUE_NAME,
        async (job) => {
          if (job.name === 'export') {
            const data = job.data as TenantOffboardingExportJob;
            await processor.runExport(data.tenantId, data.exportId);
          } else if (job.name === 'delete') {
            const data = job.data as TenantOffboardingDeleteJob;
            await processor.runDelete(data.tenantId);
          }
        },
        { connection },
      );
    }
  }

  async enqueueExport(job: TenantOffboardingExportJob): Promise<void> {
    await this.queue.add('export', job);
  }

  async enqueueDelete(
    job: TenantOffboardingDeleteJob,
    delayMs: number,
  ): Promise<void> {
    await this.queue.add('delete', job, { delay: delayMs });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
