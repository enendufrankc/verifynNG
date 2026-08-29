import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // Prevent the worker from exiting — BullMQ workers keep the process alive
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
  console.log('Worker running (BullMQ processors active)');
}

bootstrap();
