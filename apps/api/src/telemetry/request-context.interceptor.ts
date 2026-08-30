import {
  Inject,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { trace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { runWithContext, RequestContext } from './context';
import { AppLogger, APP_LOGGER } from './logger';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(@Inject(APP_LOGGER) private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const requestId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['request-id'] as string) ||
      randomUUID();

    res.setHeader('x-request-id', requestId);

    const activeSpan = trace.getActiveSpan();
    const spanContext = activeSpan?.spanContext();

    const tenantId =
      (req.tenantId as string) || (req.headers['x-tenant-id'] as string);
    const userId =
      (req.user?.id as string) || (req.headers['x-user-id'] as string);

    const ctx: RequestContext = {
      requestId,
      tenantId,
      userId,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
    };

    const start = performance.now();
    const logCompletion = () => {
      this.logger.log(
        {
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: Math.round(performance.now() - start),
        },
        'request completed',
      );
    };

    return new Observable((observer) => {
      runWithContext(ctx, () => {
        next.handle().subscribe({
          next: (val) => observer.next(val),
          error: (err) => {
            logCompletion();
            observer.error(err);
          },
          complete: () => {
            logCompletion();
            observer.complete();
          },
        });
      });
    });
  }
}
