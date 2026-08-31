import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  IMPERSONATION_EXPIRE_QUEUE,
  ImpersonationService,
} from './impersonation.service';

/**
 * Proactive revocation for the 30-minute (SUPPORT_IMPERSONATION_TTL_SECONDS)
 * impersonation window — belt-and-braces alongside ImpersonationGuard's own
 * lazy expiry check on every request, so a session that stops being polled
 * still gets its underlying E02 session revoked and its `impersonation.ended`
 * event emitted without waiting for another request to trigger it.
 */
@Processor(IMPERSONATION_EXPIRE_QUEUE)
export class ImpersonationProcessor extends WorkerHost {
  private readonly logger = new Logger(ImpersonationProcessor.name);

  constructor(private readonly impersonation: ImpersonationService) {
    super();
  }

  async process(job: Job<{ impersonationSessionId: string }>): Promise<void> {
    this.logger.log(
      `Expiring impersonation session ${job.data.impersonationSessionId}`,
    );
    await this.impersonation.end(job.data.impersonationSessionId, 'expiry');
  }
}
