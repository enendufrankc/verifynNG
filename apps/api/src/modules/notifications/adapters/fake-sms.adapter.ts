import { Injectable } from '@nestjs/common';
import { SmsPort, SmsMessage, SmsResult } from '../ports/sms.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakeSms implements SmsPort {
  private baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = config.get('FAKE_SMS_URL')!;
  }

  async send(m: SmsMessage): Promise<SmsResult> {
    const res = await fetch(`${this.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: m.to,
        from: m.from ?? 'VerifyN',
        sms: m.body,
        api_key: 'fake',
      }),
    });
    const data = (await res.json()) as { message_id: string };
    return { providerMessageId: data.message_id };
  }
}
