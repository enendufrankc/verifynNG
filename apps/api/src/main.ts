import 'reflect-metadata';
import { startOtel } from './telemetry/otel';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from '@verifynng/config';
import { AppLogger } from './telemetry/logger';

// Bootstrap OTel before Nest — must be first
startOtel();

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLogger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Trust proxy for correct IP extraction
  app.set('trust proxy', true);

  await app.listen(env.API_PORT);
  console.log(`API running on http://localhost:${env.API_PORT}`);
}

bootstrap();
