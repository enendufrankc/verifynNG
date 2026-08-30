import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from '@verifynng/config';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // web-admin (and web-verify) call this API directly from the browser, so
  // it needs its own CORS grant — a Nest server sends no
  // Access-Control-Allow-Origin header by default, which fails every
  // client-side fetch (including the Authorization header, which forces a
  // preflight) with an opaque "Failed to fetch" and no server-side trace.
  app.enableCors({ origin: [env.APP_BASE_URL, env.VERIFY_BASE_URL] });

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
