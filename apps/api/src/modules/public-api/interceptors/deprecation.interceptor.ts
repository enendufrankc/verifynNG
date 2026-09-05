import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { DEPRECATIONS } from '../deprecations.js';
import { buildDeprecationHeaders, lookupDeprecation } from '../deprecation.js';

/**
 * Stamps Deprecation/Sunset/Link headers per docs/public-api-deprecation-policy.md
 * on any route present in deprecations.ts — no controller change needed to
 * deprecate a route. See deprecation.spec.ts for the header logic in
 * isolation; this class just wires it to the live request.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const entry = lookupDeprecation(
      DEPRECATIONS,
      request.method,
      request.route?.path,
    );
    if (entry) {
      const docsUrl = `${request.protocol}://${request.get('host')}/api/docs#deprecation-policy`;
      const headers = buildDeprecationHeaders(entry, docsUrl);
      response.setHeader('Deprecation', headers.Deprecation);
      response.setHeader('Sunset', headers.Sunset);
      response.setHeader('Link', headers.Link);
    }

    return next.handle();
  }
}
