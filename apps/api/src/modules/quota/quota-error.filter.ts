/**
 * QuotaExceededFilter — catches QuotaExceededError and returns 429 with Retry-After.
 */

import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { QuotaExceededError } from './quota-error.js';

@Catch(QuotaExceededError)
export class QuotaExceededFilter implements ExceptionFilter {
  catch(exception: QuotaExceededError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((exception.resetsAt.getTime() - Date.now()) / 1000),
    );

    response.setHeader('Retry-After', retryAfterSeconds.toString());
    response.status(429).json({
      statusCode: 429,
      message: exception.message,
      error: 'Quota Exceeded',
      kind: exception.kind,
      limit: exception.limit,
      used: exception.used,
      resetsAt: exception.resetsAt.toISOString(),
    });
  }
}
