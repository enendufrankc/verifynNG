import { Injectable, LoggerService } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';
import { getContext } from './context';
import { redactLogObject } from './redaction';
import { LokiStream } from './loki-stream';

export const APP_LOGGER = 'APP_LOGGER';

@Injectable()
export class AppLogger implements LoggerService {
  private logger: PinoLogger;

  constructor() {
    const serviceName = process.env.OTEL_SERVICE_NAME || 'api';
    const lokiStream = new LokiStream(
      process.env.LOKI_URL || 'http://loki:3100',
      serviceName,
    );

    this.logger = pino(
      {
        level: process.env.LOG_LEVEL || 'info',
        formatters: {
          level(label) {
            return { level: label };
          },
        },
        base: {
          service: serviceName,
          version: process.env.npm_package_version || '0.0.0',
        },
        mixin() {
          const ctx = getContext();
          if (!ctx) return {};
          return {
            requestId: ctx.requestId,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            traceId: ctx.traceId,
            spanId: ctx.spanId,
          };
        },
      },
      lokiStream,
    );
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    this.writeLog('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.writeLog('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.writeLog('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.writeLog('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.writeLog('trace', message, optionalParams);
  }

  private writeLog(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
    message: unknown,
    optionalParams: unknown[],
  ) {
    if (typeof message === 'object' && message !== null) {
      const redacted = redactLogObject(message as Record<string, unknown>);
      const msg =
        optionalParams[0] && typeof optionalParams[0] === 'string'
          ? optionalParams[0]
          : '';
      this.logger[level](redacted, msg);
    } else {
      const meta = (optionalParams.find(
        (p) => typeof p === 'object' && p !== null,
      ) || {}) as Record<string, unknown>;
      const redactedMeta = redactLogObject(meta);
      this.logger[level](redactedMeta, String(message));
    }
  }
}
