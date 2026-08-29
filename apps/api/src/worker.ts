import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();

  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });

  console.log('Worker running (BullMQ processors active)');
}

void bootstrap();
