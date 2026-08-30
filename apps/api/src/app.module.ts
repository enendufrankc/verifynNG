import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { loadEnv, envSchema } from '@verifynng/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { TenantContextGuard } from './modules/auth/guards/tenant-context.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { InternalOnlyGuard } from './modules/auth/guards/internal-only.guard';
import { DatabaseModule } from './modules/database/database.module';
import { VerifyModule } from './modules/verify/verify.module';
import { VerifySmsModule } from './modules/verify-sms/verify-sms.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { PrismaModule } from './common/prisma.module';
import { S3Module } from './common/s3.module';
import { EventsModule } from './common/events.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BatchesModule } from './modules/batches/batches.module';
import { BullMQModule } from './jobs/bullmq.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    HealthModule,
    PrismaModule,
    S3Module,
    EventsModule,
    CatalogModule,
    BullMQModule,
    BatchesModule,
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
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
