import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PublicApiModule } from './public-api.module.js';
import { PUBLIC_API_VERSION } from './constants.js';

/**
 * Builds the OpenAPI 3.x document for `/api/v1/**` only (via `include`,
 * scoped to PublicApiModule) — never E06's internal `/v1/verify` spec
 * (apps/api/openapi/verify.v1.json) or any other `/v1/**` console route.
 * Shared by the live `GET /api/openapi.json` route and
 * scripts/generate-public-api-openapi.mjs so both stay in lock-step.
 */
export function buildPublicApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('verifynNG Public API')
    .setDescription(
      'Integrate minting, unit lifecycle and scan data into your own systems. ' +
        'Every route requires `Authorization: Bearer vk_live_…` or `vk_test_…`. ' +
        `Errors use a single envelope — see the "error" schema below. ` +
        'Deprecation policy: docs/public-api-deprecation-policy.md.',
    )
    .setVersion(PUBLIC_API_VERSION)
    .addServer('http://localhost:4000', 'Local compose')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'vk_live_… / vk_test_…',
        description:
          'An API key created in the console under Developers → API keys.',
      },
      'apiKey',
    )
    .addTag('meta', 'Key introspection')
    .addTag('batches', 'Minting and batch lookup')
    .addTag('units', 'Unit lookup and lifecycle actions')
    .addTag('scans', 'Verification scan history')
    .addTag('reports', 'Consumer fake-reports')
    .build();

  return SwaggerModule.createDocument(app, config, {
    include: [PublicApiModule],
  });
}
