import { Injectable } from '@nestjs/common';
import { ErrorTrackerPort, ErrorTrackerContext } from './error-tracker.port';
import { LogErrorTracker } from './log-error-tracker';

interface SentryScope {
  setTag(key: string, value: string): void;
  setUser(user: { id: string }): void;
  setExtras(extras: Record<string, unknown>): void;
}

interface SentryModule {
  init(options: { dsn: string; tracesSampleRate: number }): void;
  withScope(callback: (scope: SentryScope) => void): void;
  captureException(error: unknown): void;
  captureMessage(message: string, level: string): void;
  setUser(user: { id: string } | null): void;
  setTag(key: string, value: string): void;
}

@Injectable()
export class SentryErrorTracker implements ErrorTrackerPort {
  private sentryInstance?: SentryModule;

  constructor(private readonly fallback: LogErrorTracker) {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sentry = require('@sentry/node') as SentryModule;
        Sentry.init({ dsn, tracesSampleRate: 1.0 });
        this.sentryInstance = Sentry;
      } catch {
        // Fallback to LogErrorTracker if @sentry/node not present
      }
    }
  }

  captureException(error: Error | unknown, ctx?: ErrorTrackerContext): void {
    if (this.sentryInstance) {
      this.sentryInstance.withScope((scope: SentryScope) => {
        if (ctx?.requestId) scope.setTag('requestId', ctx.requestId);
        if (ctx?.tenantId) scope.setTag('tenantId', ctx.tenantId);
        if (ctx?.userId) scope.setUser({ id: ctx.userId });
        if (ctx?.extra) scope.setExtras(ctx.extra);
        this.sentryInstance?.captureException(error);
      });
    }
    this.fallback.captureException(error, ctx);
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    ctx?: ErrorTrackerContext,
  ): void {
    if (this.sentryInstance) {
      this.sentryInstance.withScope((scope: SentryScope) => {
        if (ctx?.requestId) scope.setTag('requestId', ctx.requestId);
        if (ctx?.tenantId) scope.setTag('tenantId', ctx.tenantId);
        if (ctx?.userId) scope.setUser({ id: ctx.userId });
        if (ctx?.extra) scope.setExtras(ctx.extra);
        this.sentryInstance?.captureMessage(message, level);
      });
    }
    this.fallback.captureMessage(message, level, ctx);
  }

  setUser(userId: string): void {
    this.fallback.setUser(userId);
    if (this.sentryInstance) {
      this.sentryInstance.setUser({ id: userId });
    }
  }

  setTenant(tenantId: string): void {
    this.fallback.setTenant(tenantId);
    if (this.sentryInstance) {
      this.sentryInstance.setTag('tenantId', tenantId);
    }
  }
}
