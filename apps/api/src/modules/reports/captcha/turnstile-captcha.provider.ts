import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaptchaPort, CaptchaVerifyResult } from './captcha-port';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// A hung or unreachable Cloudflare siteverify call must never hang a public,
// unauthenticated submission endpoint, so every failure path (timeout,
// network error, non-200, bad JSON) resolves to a sentinel value instead of
// throwing — verify() must never reject.
const VERIFY_TIMEOUT_MS = 3000;

@Injectable()
export class TurnstileCaptcha implements CaptchaPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, ip: string): Promise<CaptchaVerifyResult> {
    const secret = this.config.get<string>('TURNSTILE_SECRET')!;
    try {
      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
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
