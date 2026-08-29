/**
 * AuditInterceptor — automatically records audit entries for @Audited() handlers.
 *
 * Records only on 2xx responses. Extracts actor from req.user (stubbed until E02).
 * Target defaults to { type: ControllerName, id: req.params.id }.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDITED_KEY, AuditedOptions } from './audited.decorator.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const opts = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!opts) return next.handle();

    const req = context.switchToHttp().getRequest();
    const controllerName = context.getClass().name;

    return next.handle().pipe(
      tap({
        next: () => {
          // Only record on 2xx (Nest hasn't sent response yet, but no exception = 2xx)
          this.recordAudit(req, opts, controllerName).catch((err) => {
            this.logger.error(`Failed to record audit: ${err.message}`, err.stack);
          });
        },
      }),
    );
  }

  private async recordAudit(
    req: any,
    opts: AuditedOptions,
    controllerName: string,
  ) {
    const user = req.user ?? {};

    // Resolve target
    const target = opts.target
      ? opts.target(req, {})
      : {
          type: controllerName.replace(/Controller$/, '').toLowerCase(),
          id: req.params?.id ?? 'unknown',
        };

    // Build payload from request body, redacting additional keys
    let payload: Record<string, unknown> | undefined;
    if (req.body && Object.keys(req.body).length > 0) {
      payload = { ...req.body };
      if (opts.redact) {
        for (const key of opts.redact) {
          if (key in payload) payload[key] = '[REDACTED]';
        }
      }
    }

    await this.auditService.record({
      tenantId: user.tenantId,
      actor: {
        type: user.id ? 'user' : 'system',
        id: user.id,
        ip: req.ip ?? req.connection?.remoteAddress,
      },
      action: opts.action,
      target,
      payload,
      requestId: req.headers?.['x-request-id'],
    });
  }
}
