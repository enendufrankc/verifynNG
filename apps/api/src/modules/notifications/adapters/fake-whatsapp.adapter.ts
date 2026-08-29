import { Injectable } from '@nestjs/common';
import {
  WhatsAppPort,
  WhatsAppTemplateMessage,
  WhatsAppResult,
} from '../ports/whatsapp.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakeWhatsApp implements WhatsAppPort {
  private baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = config.get('FAKE_SMS_URL')!;
  }

  async sendTemplate(m: WhatsAppTemplateMessage): Promise<WhatsAppResult> {
    const res = await fetch(`${this.baseUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: m.to,
        template: m.template,
        params: m.params,
      }),
    });
    const data = (await res.json()) as { message_id: string };
    return { providerMessageId: data.message_id };
  }
}
