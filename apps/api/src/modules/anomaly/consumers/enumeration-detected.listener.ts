import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AnomalyEngine } from '../anomaly-engine.service';

interface EnumerationDetectedPayload {
  ipHash: string;
  tenantSlug: string | null;
  invalidCount: number;
  windowSec: number;
  blockedForSec: number;
  at: Date;
}

/**
 * Consumes `scan.enumeration_detected` directly (no queue hop): E06's
 * endpoint has already decided this IP crossed the enumeration threshold —
 * that's velocity evidence on its own, independent of the per-scan
 * `scan.recorded` velocity check.
 */
@Injectable()
export class EnumerationDetectedListener {
  private readonly logger = new Logger(EnumerationDetectedListener.name);

  constructor(private readonly engine: AnomalyEngine) {}

  @OnEvent('scan.enumeration_detected')
  async onEnumerationDetected(
    payload: EnumerationDetectedPayload,
  ): Promise<void> {
    try {
      await this.engine.evaluateEnumeration({
        ipHash: payload.ipHash,
        tenantSlug: payload.tenantSlug,
        invalidCount: payload.invalidCount,
        windowSec: payload.windowSec,
        at: payload.at ? new Date(payload.at) : new Date(),
      });
    } catch (err) {
      this.logger.error(
        `failed to evaluate enumeration event: ${(err as Error).message}`,
      );
    }
  }
}
