import { Injectable, Inject } from '@nestjs/common';
import { ErrorTrackerPort, ErrorTrackerContext } from './error-tracker.port';
import { AppLogger, APP_LOGGER } from '../logger';
import { getContext } from '../context';

@Injectable()
export class LogErrorTracker implements ErrorTrackerPort {
  private currentUser?: string;
  private currentTenant?: string;

  constructor(@Inject(APP_LOGGER) private readonly logger: AppLogger) {}

  captureException(error: Error | unknown, ctx?: ErrorTrackerContext): void {
    const activeCtx = getContext();
    const err = error instanceof Error ? error : new Error(String(error));

    this.logger.error({
      event: 'error_tracker.exception',
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      context: {
        requestId: ctx?.requestId || activeCtx?.requestId,
        tenantId: ctx?.tenantId || activeCtx?.tenantId || this.currentTenant,
        userId: ctx?.userId || activeCtx?.userId || this.currentUser,
        ...ctx?.extra,
      },
    });
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    ctx?: ErrorTrackerContext,
  ): void {
    const activeCtx = getContext();
    const payload = {
      event: 'error_tracker.message',
      message,
      level,
      context: {
        requestId: ctx?.requestId || activeCtx?.requestId,
        tenantId: ctx?.tenantId || activeCtx?.tenantId || this.currentTenant,
        userId: ctx?.userId || activeCtx?.userId || this.currentUser,
        ...ctx?.extra,
      },
    };

    if (level === 'error') {
      this.logger.error(payload);
    } else if (level === 'warning') {
      this.logger.warn(payload);
    } else {
      this.logger.log(payload);
    }
  }

  setUser(userId: string): void {
    this.currentUser = userId;
  }

  setTenant(tenantId: string): void {
    this.currentTenant = tenantId;
  }
}
