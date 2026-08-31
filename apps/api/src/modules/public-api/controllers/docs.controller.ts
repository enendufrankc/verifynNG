import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { Request, Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator.js';
import { buildPublicApiDocument } from '../openapi.js';
import { getPublicApiApp } from '../app-holder.js';

/**
 * `/api/openapi.json` and `/api/docs` — public, unauthenticated, and
 * excluded from the generated spec itself (ApiExcludeController).
 */
@ApiExcludeController()
@Public()
@Controller('api')
export class DocsController {
  @Get('openapi.json')
  openapiJson() {
    // Rebuilt per-request rather than cached: the app instance carries no
    // per-tenant state and this route is not on the rate-limited hot path.
    return buildPublicApiDocument(getPublicApiApp());
  }

  @Get('docs')
  docs(@Req() req: Request, @Res() res: Response) {
    const document = buildPublicApiDocument(getPublicApiApp());
    const handler = apiReference({
      content: document,
      pageTitle: 'verifynNG Public API',
    });
    return handler(req, res);
  }
}
