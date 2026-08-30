import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { FakeSms } from './fake-sms.adapter';
import { FakeWhatsApp } from './fake-whatsapp.adapter';
import { SmtpMailer } from './smtp-mailer.adapter';

const createTransportMock = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ createTransport: createTransportMock }));

const fetchMock = vi.fn();

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('notification adapter contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      json: async () => ({ message_id: 'provider-message-1' }),
    });
  });

  it('sends SMS through the fake provider and returns its provider id', async () => {
    const adapter = new FakeSms(
      config({ FAKE_SMS_URL: 'http://fake-sms:4101' }),
    );

    await expect(
      adapter.send({ to: '+2348000000001', body: 'hello', from: 'VerifyN' }),
    ).resolves.toEqual({ providerMessageId: 'provider-message-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://fake-sms:4101/api/sms/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          to: '+2348000000001',
          from: 'VerifyN',
          sms: 'hello',
          api_key: 'fake',
        }),
      }),
    );
  });

  it('sends WhatsApp through the fake provider and returns its provider id', async () => {
    const adapter = new FakeWhatsApp(
      config({ FAKE_SMS_URL: 'http://fake-sms:4101' }),
    );

    await expect(
      adapter.sendTemplate({
        to: '+2348000000001',
        template: 'anomaly.alert',
        params: { productName: 'Glow' },
      }),
    ).resolves.toEqual({ providerMessageId: 'provider-message-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://fake-sms:4101/api/whatsapp/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          to: '+2348000000001',
          template: 'anomaly.alert',
          params: { productName: 'Glow' },
        }),
      }),
    );
  });

  it('sends email through SMTP and returns the transport message id', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'smtp-message-1' });
    createTransportMock.mockReturnValue({ sendMail });
    const adapter = new SmtpMailer(
      config({
        SMTP_HOST: 'mailpit',
        SMTP_PORT: '1025',
        SMTP_USER: '',
        SMTP_PASS: '',
      }),
    );

    await expect(
      adapter.send({
        to: 'owner@ivoryglow.test',
        from: { fromName: 'IVORY GLOW', fromAddress: 'noreply@verifyn.ng' },
        subject: 'Test',
        html: '<p>Hello</p>',
        text: 'Hello',
      }),
    ).resolves.toEqual({ providerMessageId: 'smtp-message-1' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'IVORY GLOW <noreply@verifyn.ng>',
        to: 'owner@ivoryglow.test',
        subject: 'Test',
      }),
    );
  });
});
