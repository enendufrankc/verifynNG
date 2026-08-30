import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaptchaPort, CaptchaVerifyResult } from './captcha-port';

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class TurnstileCaptcha implements CaptchaPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, ip: string): Promise<CaptchaVerifyResult> {
    const secret = this.config.get<string>('TURNSTILE_SECRET')!;
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const body = (await res.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };
    return { ok: body.success, reason: body['error-codes']?.[0] };
  }
}
