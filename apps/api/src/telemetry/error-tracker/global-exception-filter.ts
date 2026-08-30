import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { ERROR_TRACKER } from './error-tracker.port';
import type { ErrorTrackerPort } from './error-tracker.port';
import { getContext } from '../context';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(ERROR_TRACKER) private readonly errorTracker: ErrorTrackerPort,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestCtx = getContext();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    if (status >= 500) {
      this.errorTracker.captureException(exception, {
        requestId: requestCtx?.requestId,
        tenantId: requestCtx?.tenantId,
        userId: requestCtx?.userId,
      });
    }

    const responseMsg =
      typeof message === 'object' && message !== null
        ? (message as Record<string, unknown>).message || message
        : message;

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      requestId: requestCtx?.requestId,
      message: responseMsg,
    });
  }
}
