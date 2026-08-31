import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PublicApiModule } from './public-api.module.js';
import { PUBLIC_API_VERSION } from './constants.js';
import { DEPRECATIONS } from './deprecations.js';

/** `GET /api/v1/units/:id` (Express, deprecations.ts's key style) → `['get', '/api/v1/units/{id}']` (OpenAPI). */
function toOpenApiPathKey(routeKey: string): [method: string, path: string] {
  const [method, expressPath] = routeKey.split(' ');
  const openApiPath = expressPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
  return [method.toLowerCase(), openApiPath];
}

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

  const document = SwaggerModule.createDocument(app, config, {
    include: [PublicApiModule],
  });

  // Reflects deprecations.ts into the spec (AC9) — no per-route decorator needed.
  for (const routeKey of Object.keys(DEPRECATIONS)) {
    const [method, path] = toOpenApiPathKey(routeKey);
    const operation = (
      document.paths?.[path] as
        | Record<string, { deprecated?: boolean }>
        | undefined
    )?.[method];
    if (operation) operation.deprecated = true;
  }

  return document;
}
