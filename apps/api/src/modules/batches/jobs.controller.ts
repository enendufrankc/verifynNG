import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('tenants/:tenantId/jobs')
export class JobsController {
  constructor(@InjectQueue('mint') private mintQueue: Queue) {}

  @Get(':jobId')
  @Roles('viewer')
  async getJob(@TenantId() _tenantId: string, @Param('jobId') jobId: string) {
    const job = await this.mintQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');

    const state = await job.getState();
    const progress = job.progress;
    const failedReason = job.failedReason;

    return {
      state,
      progress,
      failedReason,
    };
  }
}
