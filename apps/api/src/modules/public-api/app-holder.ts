import type { INestApplication } from '@nestjs/common';

/**
 * `SwaggerModule.createDocument()` needs the `INestApplication` wrapper
 * returned by `NestFactory.create()`/`moduleRef.createNestApplication()` —
 * not something a controller can inject via normal DI. Callers register it
 * once, right after building the app (main.ts's bootstrap(), and any test
 * that hits `/api/docs` or `/api/openapi.json`); DocsController reads it
 * back to build the document per request.
 */
let app: INestApplication | undefined;

export function setPublicApiApp(instance: INestApplication): void {
  app = instance;
}

export function getPublicApiApp(): INestApplication {
  if (!app) {
    throw new Error(
      'setPublicApiApp() was never called — call it right after creating the Nest app.',
    );
  }
  return app;
}
