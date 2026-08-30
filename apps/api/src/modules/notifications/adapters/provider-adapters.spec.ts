import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendMailer } from './resend-mailer.adapter';
import { TermiiSms } from './termii-sms.adapter';

const config = {
  get: vi.fn(
    (key: string) =>
      ({
        RESEND_API_KEY: 're_test',
        TERMII_API_KEY: 'termii_test',
        TERMII_SENDER: 'VerifyN',
      })[key],
  ),
} as never;

afterEach(() => vi.unstubAllGlobals());

describe('provider adapters', () => {
  it('maps the Resend email contract to its HTTP payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 're_123' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new ResendMailer(config).send({
        to: 'owner@example.test',
        from: { fromName: 'VerifyN', fromAddress: 'noreply@verifyn.ng' },
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
        tags: ['notification.test'],
      }),
    ).resolves.toEqual({ providerMessageId: 're_123' });

    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer re_test' }),
        body: expect.stringContaining('owner@example.test'),
      }),
    ]);
  });

  it('maps the Termii SMS contract to its HTTP payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message_id: 'termii_123' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new TermiiSms(config).send({ to: '+2348000000001', body: 'Test' }),
    ).resolves.toEqual({ providerMessageId: 'termii_123' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.ng.termii.com/api/sms/send',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toEqual(
      expect.stringContaining('termii_test'),
    );
  });
});
