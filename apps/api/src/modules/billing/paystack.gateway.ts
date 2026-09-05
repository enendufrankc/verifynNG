import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentGatewayPort } from './payment-gateway.port';

interface PaystackAuthorization {
  authorization_code?: string;
  last4?: string;
  card_type?: string;
  brand?: string;
}
interface PaystackTransactionData {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  gateway_response?: string;
  authorization?: PaystackAuthorization;
}

/**
 * Implements PaymentGatewayPort against Paystack's real wire format. Also
 * used, pointed at a different base URL, as the "FakePayGateway" the epic
 * doc names separately — tools/fakes/pay (T7) speaks the identical wire
 * format, so there is deliberately only one adapter class here; see
 * BillingModule's PAYMENT_GATEWAY_PORT provider for the base-url switch.
 */
@Injectable()
export class PaystackGateway implements PaymentGatewayPort {
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initialiseTransaction(i: {
    reference: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
    email: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string; providerRef: string }> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        reference: i.reference,
        amount: i.amountMinor,
        currency: i.currency,
        email: i.email,
        callback_url: i.callbackUrl,
        metadata: i.metadata,
      }),
    });
    if (!res.ok) {
      throw new Error(`Paystack initialise failed (${res.status})`);
    }
    const body = (await res.json()) as {
      data: { authorization_url: string; reference: string };
    };
    return {
      checkoutUrl: body.data.authorization_url,
      providerRef: body.data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: string;
    authorizationCode?: string;
    cardLast4?: string;
    cardBrand?: string;
  }> {
    const res = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      throw new Error(`Paystack verify failed (${res.status})`);
    }
    const body = (await res.json()) as { data: PaystackTransactionData };
    const d = body.data;
    return {
      status:
        d.status === 'success'
          ? 'success'
          : d.status === 'failed'
            ? 'failed'
            : 'pending',
      amountMinor: d.amount,
      currency: d.currency,
      authorizationCode: d.authorization?.authorization_code,
      cardLast4: d.authorization?.last4,
      cardBrand: d.authorization?.card_type ?? d.authorization?.brand,
    };
  }

  async chargeAuthorisation(i: {
    authorizationCode: string;
    email: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
    reference: string;
  }): Promise<{
    status: 'success' | 'failed';
    providerRef: string;
    failureReason?: string;
  }> {
    const res = await fetch(
      `${this.baseUrl}/transaction/charge_authorization`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          authorization_code: i.authorizationCode,
          email: i.email,
          amount: i.amountMinor,
          currency: i.currency,
          reference: i.reference,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Paystack charge_authorization failed (${res.status})`);
    }
    const body = (await res.json()) as { data: PaystackTransactionData };
    const d = body.data;
    const succeeded = d.status === 'success';
    return {
      status: succeeded ? 'success' : 'failed',
      providerRef: d.reference,
      failureReason: succeeded
        ? undefined
        : (d.gateway_response ?? 'charge_failed'),
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader) return false;
    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: Buffer): {
    type: string;
    reference: string;
    data: unknown;
  } {
    const json = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: PaystackTransactionData;
    };
    return {
      type: json.event,
      reference: json.data?.reference,
      data: json.data,
    };
  }
}
