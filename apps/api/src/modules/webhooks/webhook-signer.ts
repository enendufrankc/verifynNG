import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';

const STALE_WINDOW_SECONDS = 5 * 60;

/**
 * `X-VerifyNG-Signature: v1=<hex HMAC-SHA256(secret, "${timestamp}.${body}")>`
 * — see docs/epics/E16-public-api-webhooks.md "Webhook wire format" and
 * docs/webhooks-consumer-guide.md. Mirrored (not shared — different
 * package, deliberately decoupled) by
 * packages/sdk/src/webhook-signature.ts's verifyWebhookSignature(); keep
 * the two byte-for-byte identical.
 */
@Injectable()
export class WebhookSigner {
  sign(secret: string, timestamp: number, body: string): string {
    const hex = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return `v1=${hex}`;
  }

  verify(
    secret: string,
    timestamp: number,
    body: string,
    signature: string,
    now: number = Date.now(),
  ): boolean {
    const ageSeconds = Math.abs(now / 1000 - timestamp);
    if (ageSeconds > STALE_WINDOW_SECONDS) return false;

    const match = /^v1=([0-9a-f]+)$/.exec(signature.trim());
    if (!match) return false;

    const expected = this.sign(secret, timestamp, body);
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(`v1=${match[1]}`);
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }
}
