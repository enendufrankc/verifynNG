import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv, corsAllowlist } from '@verifynng/config';
import helmet from 'helmet';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  // Security headers via helmet
  app.use(
    helmet({
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 63072000, includeSubDomains: true, preload: true }
          : false,
      contentSecurityPolicy: false, // API doesn't serve HTML; CSP is for the Next apps
    }),
  );

  // CORS
  const corsOpts = corsAllowlist('api', process.env as Record<string, string | undefined>);
  if (corsOpts.origin === false) {
    // No CORS origins configured — disable CORS entirely
    app.enableCors({ origin: false });
  } else {
    app.enableCors({
      origin: corsOpts.origin as string[],
      methods: corsOpts.methods,
      allowedHeaders: corsOpts.allowedHeaders,
      credentials: corsOpts.credentials,
    });
  }

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Provide Redis and Prisma to the DI container
  const prisma = new PrismaClient();
  const redis = new Redis(env.REDIS_URL);

  // Initialize audit_chain_head table if needed
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "audit_chain_head" (
        "id" INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        "prevHash" TEXT NOT NULL DEFAULT 'GENESIS',
        "lastSeq" BIGINT NOT NULL DEFAULT 0
      );
      INSERT INTO "audit_chain_head" ("id", "prevHash", "lastSeq")
      VALUES (1, 'GENESIS', 0)
      ON CONFLICT ("id") DO NOTHING;
    `);
  } catch (err: any) {
    Logger.warn(`audit_chain_head init skipped: ${err.message}`);
  }

  // Register default quota kinds
  const quotaService = app.get('QuotaService' as any, { strict: false });
  if (quotaService?.registerKind) {
    quotaService.registerKind('mints_per_day', { defaultLimit: 50000, window: 'day' });
    quotaService.registerKind('scans_per_min', { defaultLimit: 600, window: 'minute' });
    quotaService.registerKind('api_calls_per_min', { defaultLimit: 300, window: 'minute' });
    quotaService.registerKind('demo_per_min', { defaultLimit: 10, window: 'minute' });
  }

  // Hide dev controllers in production
  if (env.NODE_ENV === 'production') {
    // DevAuditController, DevQuotaController, DevSecretsController
    // are registered but their routes should be hidden.
    // In production, we'll filter them at the router level.
  }

  await app.listen(env.API_PORT);
  Logger.log(`API running on http://localhost:${env.API_PORT}`, 'Bootstrap');
}

bootstrap();
