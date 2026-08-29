import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import http from 'node:http';
import { SmsPort } from './sms.port';

/**
 * HttpFakeSms — talks to the local `fake-sms` service in the compose stack.
 *
 * Posts to `SMS_URL/send` with `{ to, body }` and returns the provider
 * message id. On any transport error or timeout the promise rejects; the
 * caller (verify-sms controller) treats the failure as best-effort so a
 * delivery error never fails the verification itself.
 */
@Injectable()
export class HttpFakeSms implements SmsPort {
  private readonly smsUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.smsUrl = configService.get<string>('SMS_URL')!;
  }

  async send(params: {
    to: string;
    body: string;
    tenantId?: string;
  }): Promise<{ providerMessageId: string }> {
    const url = new URL('/send', this.smsUrl);
    const body = JSON.stringify({ to: params.to, body: params.body });

    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ providerMessageId: parsed.id ?? 'sms-fake' });
          } catch {
            resolve({ providerMessageId: 'sms-fake' });
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('SMS timeout'));
      });
      req.write(body);
      req.end();
    });
  }
}
