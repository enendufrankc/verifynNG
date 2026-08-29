import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv, envSchema } from '@verifynng/config';
import { HealthModule } from './modules/health/health.module';
import { StatusModule } from './modules/status/status.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { TelemetryModule } from './telemetry';
import { VerifyMetricsMiddleware } from './telemetry/verify-metrics.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    TelemetryModule,
    HealthModule,
    StatusModule,
    AlertsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(VerifyMetricsMiddleware).forRoutes('v1/verify/:code');
  }
}
