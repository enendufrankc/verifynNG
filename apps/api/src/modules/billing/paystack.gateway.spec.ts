import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createHmac } from 'node:crypto';
import { PaystackGateway } from './paystack.gateway';

const BASE_URL = 'https://api.paystack.co';
const SECRET_KEY = 'sk_test_1234567890';

const server = setupServer(
  http.post(`${BASE_URL}/transaction/initialize`, async ({ request }) => {
    const body = (await request.json()) as { reference: string };
    return HttpResponse.json({
      status: true,
      data: {
        authorization_url: `https://checkout.paystack.com/${body.reference}`,
        access_code: 'abc',
        reference: body.reference,
      },
    });
  }),
  http.get(`${BASE_URL}/transaction/verify/:reference`, ({ params }) =>
    HttpResponse.json({
      status: true,
      data: {
        reference: params.reference,
        status: 'success',
        amount: 4_500_000,
        currency: 'NGN',
        authorization: {
          authorization_code: 'AUTH_abc123',
          last4: '4081',
          card_type: 'visa',
        },
      },
    }),
  ),
  http.post(
    `${BASE_URL}/transaction/charge_authorization`,
    async ({ request }) => {
      const body = (await request.json()) as {
        authorization_code: string;
        reference: string;
      };
      if (body.authorization_code.endsWith('-FAIL')) {
        return HttpResponse.json({
          status: true,
          data: {
            reference: body.reference,
            status: 'failed',
            gateway_response: 'Declined',
          },
        });
      }
      return HttpResponse.json({
        status: true,
        data: {
          reference: body.reference,
          status: 'success',
          gateway_response: 'Approved',
        },
      });
    },
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('PaystackGateway', () => {
  const gateway = new PaystackGateway(BASE_URL, SECRET_KEY);

  it('initialises a transaction and returns a checkout URL', async () => {
    const result = await gateway.initialiseTransaction({
      reference: 'ref_1',
      amountMinor: 4_500_000,
      currency: 'NGN',
      email: 'owner@ivoryglow.local',
      callbackUrl: 'http://localhost:3001/billing',
      metadata: { tenantId: 'ivoryglow' },
    });
    expect(result.checkoutUrl).toBe('https://checkout.paystack.com/ref_1');
    expect(result.providerRef).toBe('ref_1');
  });

  it('verifies a successful transaction and maps the authorization', async () => {
    const result = await gateway.verifyTransaction('ref_1');
    expect(result).toEqual({
      status: 'success',
      amountMinor: 4_500_000,
      currency: 'NGN',
      authorizationCode: 'AUTH_abc123',
      cardLast4: '4081',
      cardBrand: 'visa',
    });
  });

  it('charges a stored authorization successfully', async () => {
    const result = await gateway.chargeAuthorisation({
      authorizationCode: 'AUTH_abc123',
      email: 'owner@ivoryglow.local',
      amountMinor: 4_500_000,
      currency: 'NGN',
      reference: 'ref_2',
    });
    expect(result).toEqual({
      status: 'success',
      providerRef: 'ref_2',
      failureReason: undefined,
    });
  });

  it('reports a failed charge for a -FAIL authorization (dunning fixture convention)', async () => {
    const result = await gateway.chargeAuthorisation({
      authorizationCode: 'AUTH_abc123-FAIL',
      email: 'owner@ivoryglow.local',
      amountMinor: 4_500_000,
      currency: 'NGN',
      reference: 'ref_3',
    });
    expect(result).toEqual({
      status: 'failed',
      providerRef: 'ref_3',
      failureReason: 'Declined',
    });
  });

  it('verifies a correctly-signed webhook and rejects a tampered one', () => {
    const body = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { id: 1 } }),
    );
    const validSig = createHmac('sha512', SECRET_KEY)
      .update(body)
      .digest('hex');
    expect(gateway.verifyWebhookSignature(body, validSig)).toBe(true);
    expect(gateway.verifyWebhookSignature(body, 'bad')).toBe(false);
    const tamperedBody = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { id: 2 } }),
    );
    expect(gateway.verifyWebhookSignature(tamperedBody, validSig)).toBe(false);
  });

  it('rejects an empty signature', () => {
    const body = Buffer.from('{}');
    expect(gateway.verifyWebhookSignature(body, '')).toBe(false);
  });

  it('parses a webhook payload', () => {
    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: { id: 42, reference: 'ref_1' },
      }),
    );
    expect(gateway.parseWebhook(body)).toEqual({
      type: 'charge.success',
      reference: 'ref_1',
      data: { id: 42, reference: 'ref_1' },
    });
  });
});
