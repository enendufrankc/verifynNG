/**
 * On-demand job runner: `pnpm --filter api jobs:run <job-name> [--month=YYYY-MM]`.
 * Bootstraps the full Nest application context (so every job runs through
 * the same DI graph the scheduled BullMQ workers use) and invokes one job,
 * then exits. Used by acceptance tests that don't want to wait out a cron.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults.
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../../.env.example') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ScanRollupJobService } from '../src/modules/analytics/jobs/scan-rollup.service';
import { ReconcileService } from '../src/modules/analytics/jobs/reconcile.service';
import { MeteringMonthCloseService } from '../src/modules/metering/jobs/month-close.service';
import { PageEventsService } from '../src/modules/analytics/page-events/page-events.service';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const jobName = process.argv[2];
  if (!jobName) {
    console.error('usage: jobs:run <job-name> [--month=YYYY-MM]');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    let result: unknown;
    switch (jobName) {
      case 'analytics.rollup':
        result = await app.get(ScanRollupJobService).runIncremental();
        break;
      case 'analytics.reconcile':
        result = await app.get(ReconcileService).run();
        break;
      case 'metering.upsert-month':
        result = await app
          .get(MeteringMonthCloseService)
          .upsertMonth(parseArg('month'));
        break;
      case 'metering.month-close':
        result = await app
          .get(MeteringMonthCloseService)
          .finaliseMonth(parseArg('month'));
        break;
      case 'pageviews.flush':
        result = await app.get(PageEventsService).flush();
        break;
      default:
        console.error(`unknown job: ${jobName}`);
        process.exitCode = 1;
        return;
    }
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
