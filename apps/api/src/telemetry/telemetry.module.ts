import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from './request-context.interceptor';
import { AppLogger, APP_LOGGER } from './logger';
import { ErrorTrackerModule } from './error-tracker/error-tracker.module';
import { MetricsModule } from './metrics.module';

@Global()
@Module({
  imports: [ErrorTrackerModule, MetricsModule],
  providers: [
    AppLogger,
    {
      provide: APP_LOGGER,
      useExisting: AppLogger,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
  exports: [AppLogger, APP_LOGGER, ErrorTrackerModule, MetricsModule],
})
export class TelemetryModule {}
