import { Injectable } from '@nestjs/common';
import { MailerPort, MailerMessage, MailerResult } from '../ports/mailer.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ResendMailer implements MailerPort {
  constructor(private config: ConfigService) {}

  async send(m: MailerMessage): Promise<MailerResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${m.from.fromName} <${m.from.fromAddress}>`,
        to: [m.to],
        reply_to: m.replyTo,
        subject: m.subject,
        html: m.html,
        text: m.text,
        headers: m.headers,
        tags: m.tags?.map((name) => ({ name, value: 'true' })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend request failed (${response.status})`);
    }
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error('Resend response did not include an id');
    return { providerMessageId: data.id };
  }
}
