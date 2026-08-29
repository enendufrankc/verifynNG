import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('batch-exports', { concurrency: 1 })
@Injectable()
export class BatchExportsProcessor extends WorkerHost {
  async process(
    job: Job<{ tenantId: string; batchId: string }>,
  ): Promise<void> {
    // Full implementation in Task 8
    console.log(`Batch exports job for batch ${job.data.batchId} - stub`);
  }
}
