import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv, envSchema } from '@verifynng/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AuditModule } from './modules/audit/audit.module.js';
import { QuotaModule } from './modules/quota/quota.module.js';
import { SecretsModule } from './modules/secrets/secrets.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    EventEmitterModule.forRoot(),
    AuditModule,   // E13
    QuotaModule,   // E13
    SecretsModule, // E13
    HealthModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
