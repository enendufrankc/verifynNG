import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { loadEnv, envSchema } from '@verifynng/config';
import { HealthModule } from './modules/health/health.module';
import { StatusModule } from './modules/status/status.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { TelemetryModule } from './telemetry';
import { VerifyMetricsMiddleware } from './telemetry/verify-metrics.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { TenantContextGuard } from './modules/auth/guards/tenant-context.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { InternalOnlyGuard } from './modules/auth/guards/internal-only.guard';
import { DatabaseModule } from './modules/database/database.module';
import { VerifyModule } from './modules/verify/verify.module';
import { VerifySmsModule } from './modules/verify-sms/verify-sms.module';

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
    AuthModule,
    MembersModule,
    DatabaseModule,
    VerifyModule,
    VerifySmsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: InternalOnlyGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(VerifyMetricsMiddleware).forRoutes('v1/verify/:code');
  }
}
