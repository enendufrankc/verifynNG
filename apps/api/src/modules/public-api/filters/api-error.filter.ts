import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getContext } from '../../../telemetry/context.js';
import { QuotaExceededError } from '../../quota/quota-error.js';
import { IdempotencyMismatchException } from '../errors/idempotency-mismatch.exception.js';
import { ERROR_TRACKER } from '../../../telemetry/error-tracker/error-tracker.port.js';
import type { ErrorTrackerPort } from '../../../telemetry/error-tracker/error-tracker.port.js';

export type PublicApiErrorType =
  | 'not_found'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'conflict'
  | 'idempotency_mismatch'
  | 'plan_limit'
  | 'internal';

interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * Every non-2xx response on `/api/v1/**` uses this envelope — see
 * docs/epics/E16-public-api-webhooks.md "Error envelope". Bound via
 * `@UseFilters()` on public-api controllers so it wins over the app-wide
 * `GlobalExceptionFilter` (telemetry/error-tracker), which reshapes errors
 * into its own generic body for every other route.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(
    @Inject(ERROR_TRACKER) private readonly errorTracker: ErrorTrackerPort,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getContext()?.requestId;
    const docs = `${request.protocol}://${request.get('host')}/api/docs#errors`;

    if (exception instanceof QuotaExceededError) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((exception.resetsAt.getTime() - Date.now()) / 1000),
      );
      response.setHeader('Retry-After', retryAfterSeconds.toString());
      response.setHeader('X-RateLimit-Limit', exception.limit.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      response.setHeader(
        'X-RateLimit-Reset',
        Math.floor(exception.resetsAt.getTime() / 1000).toString(),
      );
      this.send(
        response,
        429,
        'rate_limited',
        exception.message,
        requestId,
        docs,
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (this.isStructured(body)) {
        this.send(
          response,
          status,
          body.type ?? this.typeForStatus(status, exception),
          body.message ?? exception.message,
          requestId,
          docs,
          body.details,
        );
        return;
      }

      const rawMessage =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: unknown }).message
          : exception.message;

      if (Array.isArray(rawMessage)) {
        this.send(
          response,
          status,
          'validation',
          'Validation failed',
          requestId,
          docs,
          rawMessage.map((issue: string) => ({ issue })),
        );
        return;
      }

      this.send(
        response,
        status,
        this.typeForStatus(status, exception),
        String(rawMessage),
        requestId,
        docs,
      );
      return;
    }

    this.errorTracker.captureException(exception, { requestId });
    this.send(
      response,
      500,
      'internal',
      'Internal server error',
      requestId,
      docs,
    );
  }

  private isStructured(body: unknown): body is {
    type?: PublicApiErrorType;
    message?: string;
    details?: ErrorDetail[];
  } {
    return typeof body === 'object' && body !== null && 'type' in body;
  }

  private typeForStatus(
    status: number,
    exception: HttpException,
  ): PublicApiErrorType {
    if (exception instanceof IdempotencyMismatchException) {
      return 'idempotency_mismatch';
    }
    switch (status) {
      case 400:
        return 'validation';
      case 401:
        return 'unauthorized';
      case 402:
        return 'plan_limit';
      case 403:
        return 'forbidden';
      case 404:
        return 'not_found';
      case 409:
        return 'conflict';
      case 429:
        return 'rate_limited';
      default:
        return 'internal';
    }
  }

  private send(
    response: Response,
    status: number,
    type: PublicApiErrorType,
    message: string,
    requestId: string | undefined,
    docs: string,
    details?: ErrorDetail[],
  ): void {
    response.status(status).json({
      error: {
        type,
        message,
        requestId,
        docs,
        ...(details ? { details } : {}),
      },
    });
  }
}
