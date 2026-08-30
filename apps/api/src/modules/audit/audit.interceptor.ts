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
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!opts) return next.handle();

    const req: AuthenticatedRequest = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const controllerName = context.getClass().name;

    return next.handle().pipe(
      tap({
        next: () => {
          // Only record on 2xx (Nest hasn't sent response yet, but no exception = 2xx)
          this.recordAudit(req, res, opts, controllerName).catch((err) => {
            this.logger.error(
              `Failed to record audit: ${err.message}`,
              err.stack,
            );
          });
        },
      }),
    );
  }

  private async recordAudit(
    req: AuthenticatedRequest,
    res: Parameters<NonNullable<AuditedOptions['target']>>[1],
    opts: AuditedOptions,
    controllerName: string,
  ) {
    const user = req.user ?? {};

    // Resolve target
    const paramId = req.params?.id;
    const target = opts.target
      ? opts.target(req, res)
      : {
          type: controllerName.replace(/Controller$/, '').toLowerCase(),
          id: (Array.isArray(paramId) ? paramId[0] : paramId) ?? 'unknown',
        };

    // Build payload from request body, redacting additional keys
    let payload: Record<string, unknown> | undefined;
    if (req.body && Object.keys(req.body).length > 0) {
      const redacted: Record<string, unknown> = { ...req.body };
      if (opts.redact) {
        for (const key of opts.redact) {
          if (key in redacted) redacted[key] = '[REDACTED]';
        }
      }
      payload = redacted;
    }

    const requestIdHeader = req.headers?.['x-request-id'];
    const requestId = Array.isArray(requestIdHeader)
      ? requestIdHeader[0]
      : requestIdHeader;

    await this.auditService.record({
      // A platform-support-only principal's JWT carries tid:"" (no active
      // tenant), not null/undefined — passed straight through, that empty
      // string violates AuditLog's tenantId foreign key (found via E19's
      // @Audited('retention.run') on a support-only route: every such call
      // was silently failing to audit-log at all, logged only as a caught
      // "Failed to record audit" error). AuditLog.tenantId is nullable for
      // exactly the "no tenant context" case this normalizes to.
      tenantId: user.tenantId || undefined,
      actor: {
        // req.user.id is E02's deprecated alias — real principals set
        // userId; reading only .id meant actorId was empty on every
        // @Audited() call platform-wide since E02's real auth replaced the
        // header-stub era this field name predates.
        type: (user.userId ?? user.id) ? 'user' : 'system',
        id: user.userId ?? user.id,
        ip: req.ip ?? req.connection?.remoteAddress,
      },
      action: opts.action,
      target,
      payload,
      requestId,
    });
  }
}
