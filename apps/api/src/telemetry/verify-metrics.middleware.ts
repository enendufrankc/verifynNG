import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Metrics } from './metrics';
import { getContext } from './context';

@Injectable()
export class VerifyMetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = performance.now();

    const originalSend = res.send.bind(res);
    let verdict = 'unknown';

    res.send = (body?: unknown): Response => {
      if (body && typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          if (parsed.verdict) verdict = parsed.verdict;
        } catch {
          // non-JSON body
        }
      } else if (
        body &&
        typeof body === 'object' &&
        'verdict' in (body as Record<string, unknown>)
      ) {
        verdict = String((body as Record<string, unknown>).verdict);
      }
      return originalSend(body);
    };

    res.on('finish', () => {
      const durationMs = performance.now() - start;
      const ctx = getContext();
      const labels = {
        tier: '1',
        verdict: res.statusCode >= 500 ? 'error' : verdict,
        tenantId: ctx?.tenantId || 'anonymous',
      };

      Metrics.verifyLatency.record(durationMs, labels);
      Metrics.verifyVerdicts.add(1, labels);
    });

    next();
  }
}
