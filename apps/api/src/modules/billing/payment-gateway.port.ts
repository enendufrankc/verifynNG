import { InjectionToken } from '@nestjs/common';

export interface PaymentGatewayPort {
  initialiseTransaction(i: {
    reference: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
    email: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string; providerRef: string }>;

  verifyTransaction(reference: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: string;
    authorizationCode?: string;
    cardLast4?: string;
    cardBrand?: string;
  }>;

  chargeAuthorisation(i: {
    authorizationCode: string;
    email: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
    reference: string;
  }): Promise<{
    status: 'success' | 'failed';
    providerRef: string;
    failureReason?: string;
  }>;

  // Paystack: HMAC-SHA512 of the raw body with the secret key, header
  // x-paystack-signature.
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean;

  parseWebhook(rawBody: Buffer): {
    type:
      | 'charge.success'
      | 'charge.failed'
      | 'invoice.payment_failed'
      | string;
    reference: string;
    data: unknown;
  };
}

// See batches/entitlement.policy.ts for why this is a string InjectionToken
// rather than a class token (NestJS v11's InjectionToken is a type alias,
// not something to `new`).
export const PAYMENT_GATEWAY_PORT: InjectionToken<PaymentGatewayPort> =
  'PAYMENT_GATEWAY_PORT';
