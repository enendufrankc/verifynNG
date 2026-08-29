import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv, corsAllowlist } from '@verifynng/config';
import helmet from 'helmet';
import { QuotaService } from './modules/quota/quota.service.js';

// AuditLog.seq and AuditChainCheckpoint's seq fields are Postgres BIGINTs; JSON.stringify
// can't serialize a native BigInt without this.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

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
  const corsOpts = corsAllowlist(
    'api',
    process.env as Record<string, string | undefined>,
  );
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

  // Register default quota kinds
  const quotaService = app.get(QuotaService, { strict: false });
  quotaService.registerKind('mints_per_day', {
    defaultLimit: 50000,
    window: 'day',
  });
  quotaService.registerKind('scans_per_min', {
    defaultLimit: 600,
    window: 'minute',
  });
  quotaService.registerKind('api_calls_per_min', {
    defaultLimit: 300,
    window: 'minute',
  });
  quotaService.registerKind('demo_per_min', {
    defaultLimit: 10,
    window: 'minute',
  });

  await app.listen(env.API_PORT);
  Logger.log(`API running on http://localhost:${env.API_PORT}`, 'Bootstrap');
}

bootstrap();
