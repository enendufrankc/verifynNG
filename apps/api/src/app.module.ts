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
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module.js';
import { QuotaModule } from './modules/quota/quota.module.js';
import { SecretsModule } from './modules/secrets/secrets.module.js';
import { TenantStatusModule } from './common/tenant-status/tenant-status.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PrismaModule } from './common/prisma.module';
import { S3Module } from './common/s3.module';
import { EventsModule } from './common/events.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BatchesModule } from './modules/batches/batches.module';
import { BullMQModule } from './jobs/bullmq.module';
import { ReportsModule } from './modules/reports/reports.module';
import { OemManifestModule } from './modules/oem-manifest/oem-manifest.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { LegalModule } from './modules/legal/legal.module';
import { ConsentModule } from './modules/consent/consent.module';
import { DsarModule } from './modules/dsar/dsar.module';
import { RetentionModule } from './modules/retention/retention.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { UnitsModule } from './modules/units/units.module';
import { AnomalyModule } from './modules/anomaly/anomaly.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SsoModule } from './modules/sso/sso.module';

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
    NotificationsModule,
    // Not `EventEmitterModule.forRoot()` here too — EventsModule (below)
    // already calls it once. A second forRoot() call gives NestJS's DI two
    // separate EventEmitter2 provider registrations: consumers that inject
    // EventEmitter2 directly (verify.controller.ts, this file's own
    // subscribers) ended up on a different instance than emitters going
    // through EventsService.emit() (mint.service.ts, notifications), so an
    // event emitted through EventsService was silently never seen by a
    // directly-injected listener — found while wiring E12's `batch.minted`
    // metering subscriber, which is exactly that combination.
    AuditModule,
    QuotaModule,
    SecretsModule,
    TenantStatusModule,
    TenantsModule,
    PrismaModule,
    S3Module,
    EventsModule,
    CatalogModule,
    BullMQModule,
    BatchesModule,
    ReportsModule,
    OemManifestModule,
    AnalyticsModule,
    LegalModule,
    ConsentModule,
    DsarModule,
    RetentionModule,
    IncidentsModule,
    UnitsModule,
    AnomalyModule,
    EntitlementsModule,
    ApiKeysModule,
    PublicApiModule,
    WebhooksModule,
    SsoModule,
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
