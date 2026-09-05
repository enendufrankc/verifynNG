import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { QuotaService } from '../../quota/quota.service.js';
import { PUBLIC_API_QUOTA_KIND } from '../constants.js';

/**
 * Per-key rate limit via E13's QuotaService, registered under
 * PUBLIC_API_QUOTA_KIND (see main.ts bootstrap). QuotaExceededError is
 * translated into the 429 envelope by ApiErrorFilter, not here.
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(private readonly quotaService: QuotaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const apiKey = request.apiKey!;

    await this.quotaService.assertWithinQuota(
      apiKey.tenantId,
      PUBLIC_API_QUOTA_KIND,
      { key: apiKey.keyId, cost: 1 },
    );

    const { used, limit, resetsAt } = await this.quotaService.peek(
      apiKey.tenantId,
      PUBLIC_API_QUOTA_KIND,
      apiKey.keyId,
    );
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, limit - used).toString(),
    );
    response.setHeader(
      'X-RateLimit-Reset',
      Math.floor(resetsAt.getTime() / 1000).toString(),
    );

    return next.handle();
  }
}
