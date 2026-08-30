import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ConfigService } from '@nestjs/config';
import { TurnstileCaptcha } from './turnstile-captcha.provider';

const server = setupServer(
  http.post(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    async ({ request }) => {
      const body = await request.formData();
      const token = body.get('response');
      if (token === 'ok-test') return HttpResponse.json({ success: true });
      return HttpResponse.json({
        success: false,
        'error-codes': ['invalid-input-response'],
      });
    },
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TurnstileCaptcha', () => {
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  const captcha = new TurnstileCaptcha(config);

  it('resolves ok for a success token', async () => {
    const result = await captcha.verify('ok-test', '1.2.3.4');
    expect(result.ok).toBe(true);
  });

  it('resolves not-ok with a reason for a failing token', async () => {
    const result = await captcha.verify('bad-token', '1.2.3.4');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-input-response');
  });

  it('resolves a captcha_service_error on a network error', async () => {
    server.use(
      http.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        () => HttpResponse.error(),
      ),
    );
    const result = await captcha.verify('ok-test', '1.2.3.4');
    expect(result).toEqual({ ok: false, reason: 'captcha_service_error' });
  });

  it('resolves a captcha_service_error on a non-200 response', async () => {
    server.use(
      http.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const result = await captcha.verify('ok-test', '1.2.3.4');
    expect(result).toEqual({ ok: false, reason: 'captcha_service_error' });
  });

  it('resolves a captcha_service_error on a malformed (non-JSON) body', async () => {
    server.use(
      http.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        () => new HttpResponse('not json', { status: 200 }),
      ),
    );
    const result = await captcha.verify('ok-test', '1.2.3.4');
    expect(result).toEqual({ ok: false, reason: 'captcha_service_error' });
  });

  it('resolves a captcha_service_error when the response shape is invalid', async () => {
    server.use(
      http.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        () => HttpResponse.json({ unexpected: 'shape' }),
      ),
    );
    const result = await captcha.verify('ok-test', '1.2.3.4');
    expect(result).toEqual({ ok: false, reason: 'captcha_service_error' });
  });
});
