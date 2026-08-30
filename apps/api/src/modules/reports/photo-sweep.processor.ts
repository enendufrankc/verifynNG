import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';

// Schedules the hourly `photo.sweep` repeatable job on the `reports` queue.
// Deliberately NOT a @Processor/WorkerHost: BullMQ's Worker pulls jobs off a
// queue in FIFO order without filtering by job name, so a second WorkerHost
// bound to the same queue as PhotoProcessor would race it for every job
// (including `photo.process` jobs) rather than only picking up sweeps. The
// actual `photo.sweep` handling lives in PhotoProcessor.process() instead —
// this class only ever enqueues, never consumes.
@Injectable()
export class PhotoSweepProcessor implements OnModuleInit {
  constructor(@InjectQueue('reports') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // BullMQ 6 dropped `repeat` from Queue.add()'s options — repeatable jobs
    // are scheduled via a named JobScheduler instead. upsertJobScheduler is
    // idempotent: re-running this on every boot updates the existing
    // schedule rather than creating duplicates.
    await this.queue.upsertJobScheduler(
      'photo-sweep-repeat',
      { every: 60 * 60 * 1000 },
      { name: 'photo.sweep', data: {} },
    );
  }
}
