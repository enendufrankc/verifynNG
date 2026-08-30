import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailerPort, MailerMessage, MailerResult } from '../ports/mailer.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmtpMailer implements MailerPort {
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: Number(config.get('SMTP_PORT')),
      secure: false,
      auth: config.get('SMTP_USER')
        ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
        : undefined,
    });
  }

  async send(m: MailerMessage): Promise<MailerResult> {
    const result = await this.transporter.sendMail({
      from: `${m.from.fromName} <${m.from.fromAddress}>`,
      to: m.to,
      replyTo: m.replyTo,
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: m.headers,
    });
    return { providerMessageId: result.messageId };
  }
}
