import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { PUBLIC_API_VERSION } from '../constants.js';

/** Stamps `ApiVersion` on every `/api/v1` response — success or error. */
@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('ApiVersion', PUBLIC_API_VERSION);
    return next.handle();
  }
}
