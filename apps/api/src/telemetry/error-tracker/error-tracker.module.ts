import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ERROR_TRACKER } from './error-tracker.port';
import { LogErrorTracker } from './log-error-tracker';
import { SentryErrorTracker } from './sentry-error-tracker';
import { GlobalExceptionFilter } from './global-exception-filter';

@Global()
@Module({
  providers: [
    LogErrorTracker,
    SentryErrorTracker,
    {
      provide: ERROR_TRACKER,
      useFactory: (
        logTracker: LogErrorTracker,
        sentryTracker: SentryErrorTracker,
      ) => {
        return process.env.SENTRY_DSN ? sentryTracker : logTracker;
      },
      inject: [LogErrorTracker, SentryErrorTracker],
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [ERROR_TRACKER, LogErrorTracker, SentryErrorTracker],
})
export class ErrorTrackerModule {}
