import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError, lastValueFrom } from 'rxjs';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor.js';
import type { AuditedOptions } from './audited.decorator.js';
import type { AuditService } from './audit.service.js';

function makeContext(opts: {
  handlerMeta?: AuditedOptions;
  req: Record<string, unknown>;
  className?: string;
}) {
  const reflector = {
    get: vi.fn().mockReturnValue(opts.handlerMeta),
  } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({ name: opts.className ?? 'DemoController' }),
    switchToHttp: () => ({
      getRequest: () => opts.req,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

async function flush() {
  await new Promise((r) => setImmediate(r));
}

describe('AuditInterceptor', () => {
  let auditService: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditService = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('does nothing when the handler has no @Audited metadata', async () => {
    const { reflector, context } = makeContext({
      handlerMeta: undefined,
      req: {},
    });
    const interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));
    await flush();

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('records after a successful response, defaulting the actor to system', async () => {
    const req = { params: {}, headers: {}, body: {} };
    const { reflector, context } = makeContext({
      handlerMeta: { action: 'demo.touch' },
      req,
      className: 'DemoController',
    });
    const interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));
    await flush();

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'demo.touch',
        actor: expect.objectContaining({ type: 'system' }),
        target: { type: 'demo', id: 'unknown' },
      }),
    );
  });

  it('does not record when the handler throws', async () => {
    const { reflector, context } = makeContext({
      handlerMeta: { action: 'demo.touch' },
      req: { params: {}, headers: {}, body: {} },
    });
    const interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toThrow('boom');
    await flush();

    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('resolves the target via req.params.id by default, and the actor from req.user', async () => {
    const req = {
      params: { id: 'unit-42' },
      headers: {},
      body: {},
      user: { id: 'u1', tenantId: 't1' },
    };
    const { reflector, context } = makeContext({
      handlerMeta: { action: 'unit.flag' },
      req,
      className: 'UnitController',
    });
    const interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));
    await flush();

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { type: 'unit', id: 'unit-42' },
        actor: expect.objectContaining({ type: 'user', id: 'u1' }),
        tenantId: 't1',
      }),
    );
  });

  it('uses a custom target resolver when provided', async () => {
    const req = { params: {}, headers: {}, body: {} };
    const target = { type: 'custom', id: 'c1' };
    const { reflector, context } = makeContext({
      handlerMeta: { action: 'custom.action', target: () => target },
      req,
    });
    const interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));
    await flush();

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ target }),
    );
  });

  it('redacts configured keys from the recorded payload', async () => {
    const req = {
      params: {},
      headers: {},
      body: { password: 'secret', keep: 'yes' },
    };
    const { reflector, context } = makeContext({
      handlerMeta: { action: 'demo.touch', redact: ['password'] },
      req,
    });
    const interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
    );
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));
    await flush();

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { password: '[REDACTED]', keep: 'yes' },
      }),
    );
  });
});
