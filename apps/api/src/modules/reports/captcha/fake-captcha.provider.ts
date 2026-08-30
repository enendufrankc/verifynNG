import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaptchaPort, CaptchaVerifyResult } from './captcha-port';

// A hung or unreachable fake-captcha container must never hang a public,
// unauthenticated submission endpoint, so every failure path (timeout,
// network error, non-200, bad JSON) resolves to a sentinel value instead of
// throwing — verify() must never reject.
const VERIFY_TIMEOUT_MS = 3000;

@Injectable()
export class FakeCaptcha implements CaptchaPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, _ip: string): Promise<CaptchaVerifyResult> {
    const url = this.config.get<string>(
      'FAKE_CAPTCHA_URL',
      'http://fake-captcha:4106',
    );
    try {
      const res = await fetch(`${url}/siteverify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ response: token }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      if (!res.ok) {
        return { ok: false, reason: 'captcha_service_error' };
      }
      const body = (await res.json()) as {
        success?: unknown;
        'error-codes'?: string[];
      };
      if (typeof body.success !== 'boolean') {
        return { ok: false, reason: 'captcha_service_error' };
      }
      return { ok: body.success, reason: body['error-codes']?.[0] };
    } catch {
      return { ok: false, reason: 'captcha_service_error' };
    }
  }
}
