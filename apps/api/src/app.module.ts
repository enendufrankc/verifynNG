import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv, envSchema } from '@verifynng/config';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { TenantStatusModule } from './common/tenant-status/tenant-status.module';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    HealthModule,
    TenantStatusModule,
    TenantsModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
