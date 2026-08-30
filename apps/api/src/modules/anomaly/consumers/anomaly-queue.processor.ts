import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AnomalyEngine } from '../anomaly-engine.service';
import { RulesService } from '../rules/rules.service';
import { runGeoDispersionSweep } from '../sweeps/geo-dispersion.sweep';
import { runDeadCodeSweep } from '../sweeps/dead-code.sweep';

/**
 * Single worker for the `anomaly` queue: per-scan `evaluate` jobs and the
 * repeatable `sweep:*` jobs. One `@Processor` per queue name — job-name
 * dispatch happens inside `process()`.
 */
@Processor('anomaly', { concurrency: 5 })
@Injectable()
export class AnomalyQueueProcessor extends WorkerHost {
  constructor(
    private readonly engine: AnomalyEngine,
    private readonly prisma: PrismaClient,
    private readonly rules: RulesService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'evaluate':
        await this.engine.evaluate(job.data.scanEventId);
        return;
      case 'sweep:geo_dispersion':
        await runGeoDispersionSweep(this.prisma, this.rules, this.engine);
        return;
      case 'sweep:dead_code':
        await runDeadCodeSweep(this.prisma, this.rules, this.engine);
        return;
      default:
        return;
    }
  }
}
