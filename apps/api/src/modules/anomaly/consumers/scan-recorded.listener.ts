import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

interface ScanRecordedPayload {
  scanEventId: string;
}

/**
 * Bridges the in-process `scan.recorded` domain event (emitted by E06's
 * verify path) onto the `anomaly` BullMQ queue, so rule evaluation runs off
 * the request path and can't slow down a verify response.
 */
@Injectable()
export class ScanRecordedListener {
  private readonly logger = new Logger(ScanRecordedListener.name);

  constructor(@InjectQueue('anomaly') private readonly anomalyQueue: Queue) {}

  @OnEvent('scan.recorded')
  async onScanRecorded(payload: ScanRecordedPayload): Promise<void> {
    if (!payload?.scanEventId) return;
    try {
      await this.anomalyQueue.add(
        'evaluate',
        { scanEventId: payload.scanEventId },
        { removeOnComplete: 500, removeOnFail: 200 },
      );
    } catch (err) {
      this.logger.error(
        `failed to enqueue anomaly evaluation: ${(err as Error).message}`,
      );
    }
  }
}
