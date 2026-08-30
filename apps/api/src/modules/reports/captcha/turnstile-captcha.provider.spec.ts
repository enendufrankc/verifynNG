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
});
