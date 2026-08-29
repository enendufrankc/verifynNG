import { Injectable } from '@nestjs/common';
import { SmsPort, SmsMessage, SmsResult } from '../ports/sms.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TermiiSms implements SmsPort {
  constructor(private config: ConfigService) {}

  async send(m: SmsMessage): Promise<SmsResult> {
    const response = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: m.to,
        from: m.from ?? this.config.get('TERMII_SENDER') ?? 'VerifyN',
        sms: m.body,
        type: 'plain',
        channel: 'generic',
        api_key: this.config.get('TERMII_API_KEY'),
      }),
    });
    if (!response.ok) {
      throw new Error(`Termii request failed (${response.status})`);
    }
    const data = (await response.json()) as { message_id?: string };
    if (!data.message_id) {
      throw new Error('Termii response did not include a message_id');
    }
    return { providerMessageId: data.message_id };
  }
}
