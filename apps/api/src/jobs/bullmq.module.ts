import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { loadEnv } from '@verifynng/config';

@Module({
  imports: [
    BullModule.forRoot({
      connection: (() => {
        const env = loadEnv();
        const url = new URL(env.REDIS_URL);
        return {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
        };
      })(),
    }),
    BullModule.registerQueue(
      {
        name: 'mint',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
      {
        name: 'batch-exports',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
      {
        name: 'reports',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
      {
        name: 'anomaly',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
      {
        name: 'units',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
      {
        name: 'billing',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
      {
        name: 'webhooks',
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
      },
    ),
  ],
  exports: [BullModule],
})
export class BullMQModule {}
