import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnitLifecycleService } from './unit-lifecycle.service';

const PAGE_SIZE = 500;

export interface RecallJobData {
  tenantId: string;
  batchId: string;
  reason: string;
  actorType: 'user' | 'system';
  actorId: string | null;
}

/**
 * Recall a whole batch: decommission every active/flagged unit, paged so a
 * 100k-unit batch doesn't load into memory at once. Reuses
 * `UnitLifecycleService.decommission` unit-by-unit (so `restore` remains
 * possible per unit afterwards — there is deliberately no bulk restore).
 */
@Processor('units', { concurrency: 1 })
@Injectable()
export class RecallProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly lifecycle: UnitLifecycleService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<RecallJobData>): Promise<void> {
    if (job.name !== 'recall') return;
    const { tenantId, batchId, reason, actorType, actorId } = job.data;

    const total = await this.prisma.unit.count({
      where: { tenantId, batchId, state: { in: ['active', 'flagged'] } },
    });

    let decommissioned = 0;
    for (;;) {
      const page = await this.prisma.unit.findMany({
        where: { tenantId, batchId, state: { in: ['active', 'flagged'] } },
        take: PAGE_SIZE,
        orderBy: { serial: 'asc' },
      });
      if (page.length === 0) break;

      for (const unit of page) {
        await this.lifecycle.decommission(tenantId, unit.id, {
          actor: { type: actorType, id: actorId ?? undefined },
          reason,
          recallJobId: job.id,
          skipAudit: true,
        });
        decommissioned += 1;
      }

      await job.updateProgress(
        total > 0 ? Math.round((decommissioned / total) * 100) : 100,
      );
    }

    this.eventEmitter.emit('batch.recalled', {
      tenantId,
      batchId,
      unitsDecommissioned: decommissioned,
      jobId: job.id,
    });
  }
}
