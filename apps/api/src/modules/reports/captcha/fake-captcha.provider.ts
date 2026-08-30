import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CaptchaPort, CaptchaVerifyResult } from './captcha-port';

@Injectable()
export class FakeCaptcha implements CaptchaPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, _ip: string): Promise<CaptchaVerifyResult> {
    const url = this.config.get<string>(
      'FAKE_CAPTCHA_URL',
      'http://fake-captcha:4106',
    );
    const res = await fetch(`${url}/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ response: token }),
    });
    const body = (await res.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };
    return { ok: body.success, reason: body['error-codes']?.[0] };
  }
}
