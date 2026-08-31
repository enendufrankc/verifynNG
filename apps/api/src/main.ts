import 'reflect-metadata';
import { startOtel } from './telemetry/otel';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv, corsAllowlist } from '@verifynng/config';
import helmet from 'helmet';
import { QuotaService } from './modules/quota/quota.service.js';
import { AppLogger } from './telemetry/logger';
import { setPublicApiApp } from './modules/public-api/app-holder.js';

// Bootstrap OTel before Nest — must be first
startOtel();

// AuditLog.seq and AuditChainCheckpoint's seq fields are Postgres BIGINTs; JSON.stringify
// can't serialize a native BigInt without this.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLogger));
  setPublicApiApp(app);

  // Security headers (E13). CSP is handled by the Next apps; the API serves no HTML.
  app.use(
    helmet({
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 63072000, includeSubDomains: true, preload: true }
          : false,
      contentSecurityPolicy: false,
    }),
  );
  const corsOpts = corsAllowlist(
    'api',
    process.env as Record<string, string | undefined>,
  );
  if (corsOpts.origin === false) {
    app.enableCors({ origin: false });
  } else {
    app.enableCors({
      origin: corsOpts.origin as string[],
      methods: corsOpts.methods,
      allowedHeaders: corsOpts.allowedHeaders,
      credentials: corsOpts.credentials,
    });
  }

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

  // Default quota kinds (E13); other epics register theirs via QuotaService.registerKind().
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
  quotaService.registerKind('reports_per_ip_per_hour', {
    defaultLimit: 5,
    window: 'hour',
  });
  quotaService.registerKind('report_uploads_per_ip_per_hour', {
    defaultLimit: 15,
    window: 'hour',
  });
  // manifest_downloads_per_hour is registered by OemManifestModule.onModuleInit()
  // public_api_per_min is registered by PublicApiModule.onModuleInit()

  await app.listen(env.API_PORT);
  console.log(`API running on http://localhost:${env.API_PORT}`);
}

bootstrap();
