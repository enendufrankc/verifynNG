import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv, envSchema } from '@verifynng/config';
import { PrismaModule } from '../../common/prisma.module';
import { EventsModule } from '../../common/events.module';
import { AnalyticsModule } from './analytics.module';

/**
 * A minimal bootstrap root for `pnpm --filter api jobs:run <name>` —
 * everything the analytics/metering jobs need and nothing else. Booting the
 * full AppModule here pulls in every feature module's dependency graph
 * (notification templates, PDF export rendering, …) just to run a rollup
 * job; those aren't just unnecessary, one of them (@react-pdf's hyphenation
 * data) doesn't resolve under tsx's ESM interop at all, which would break
 * every job, not just the ones that need it.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    PrismaModule,
    EventsModule,
    AnalyticsModule,
  ],
})
export class JobsRunnerModule {}
