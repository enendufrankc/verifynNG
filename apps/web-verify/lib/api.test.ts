// @vitest-environment node
//
// `server-only` (imported by ./api) throws if `window` is defined, so this
// file must run under the node environment, not the project's default
// jsdom — jsdom would otherwise make every import of lib/api.ts throw.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VerifyResponse } from './api';

// `server-only` unconditionally throws when imported outside Next's own
// bundler (it relies on Next's webpack/turbopack config to alias it away on
// the server graph) — shim it so this file can exercise ./api under Vitest.
vi.mock('server-only', () => ({}));

const validBody: VerifyResponse = {
  verdict: 'ok',
  severity: 'green',
  code: 'ivoryglow.1.k1.ABCD…',
  message: 'ok',
  reportable: false,
};

describe('verifyCode', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('parses a valid 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(validBody), { status: 200 }),
        ),
    );
    const { verifyCode } = await import('./api');
    const result = await verifyCode('ivoryglow.1.k1.ABCD', {
      ip: '1.2.3.4',
      userAgent: 'test-ua',
    });
    expect(result).toEqual({ ok: true, data: validBody });
  });

  it('treats a 429 body as a successful rate-limited verdict, not an error', async () => {
    const body: VerifyResponse = {
      ...validBody,
      verdict: 'rate-limited',
      severity: 'grey',
      retryAfterSec: 30,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body), { status: 429 })),
    );
    const { verifyCode } = await import('./api');
    const result = await verifyCode('x', { ip: null, userAgent: null });
    expect(result).toEqual({ ok: true, data: body });
  });

  it('returns http-error on a 5xx without retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const { verifyCode } = await import('./api');
    const result = await verifyCode('x', { ip: null, userAgent: null });
    expect(result).toEqual({ ok: false, reason: 'http-error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on a network error, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validBody), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { verifyCode } = await import('./api');
    const result = await verifyCode('x', { ip: null, userAgent: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('gives up as a network error after two consecutive failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const { verifyCode } = await import('./api');
    const result = await verifyCode('x', { ip: null, userAgent: null });
    expect(result).toEqual({ ok: false, reason: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forwards ip/user-agent as headers, never as query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(validBody), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { verifyCode } = await import('./api');
    await verifyCode('ivoryglow.1.k1.ABCD', {
      ip: '9.9.9.9',
      userAgent: 'ua-x',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-forwarded-for']).toBe('9.9.9.9');
    expect(headers['user-agent']).toBe('ua-x');
    expect(url).not.toContain('9.9.9.9');
  });

  it("reconstructs a rate-limited verdict from Retry-After when a 429 body is not E06's shape (AC3 — see the E17 change request)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 429,
            message: 'Too many verification attempts. Please try again later.',
          }),
          {
            status: 429,
            headers: { 'retry-after': '52' },
          },
        ),
      ),
    );
    const { verifyCode } = await import('./api');
    const result = await verifyCode(
      'ivoryglow.2.k1.EXRHB2WE05JN1JYGA7SM.3S4GP8Z0',
      {
        ip: null,
        userAgent: null,
      },
    );
    expect(result).toEqual({
      ok: true,
      data: {
        verdict: 'rate-limited',
        severity: 'grey',
        code: 'ivoryglow.2.k1.EXRH…',
        message: 'Too many verification attempts. Please try again later.',
        reportable: false,
        retryAfterSec: 52,
      },
    });
  });

  it('rejects a response that fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ verdict: 'not-a-real-verdict' }), {
            status: 200,
          }),
        ),
    );
    const { verifyCode } = await import('./api');
    const result = await verifyCode('x', { ip: null, userAgent: null });
    expect(result).toEqual({ ok: false, reason: 'bad-response' });
  });
});
