export const CAPTCHA_PORT = 'CAPTCHA_PORT';

export interface CaptchaVerifyResult {
  ok: boolean;
  reason?: string;
}

export interface CaptchaPort {
  verify(token: string, ip: string): Promise<CaptchaVerifyResult>;
}
