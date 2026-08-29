import { Injectable } from '@nestjs/common';
import { Mailer, MailMessage } from './mailer.interface';
import nodemailer from 'nodemailer';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class SmtpMailer implements Mailer {
  private transporter: nodemailer.Transporter;

  constructor() {
    const env = loadEnv();
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    } as any);
  }

  async send(msg: MailMessage): Promise<void> {
    const env = loadEnv();
    const baseUrl = env.APP_BASE_URL ?? 'http://localhost:3001';

    let subject: string;
    let html: string;

    switch (msg.template) {
      case 'password-reset':
        subject = 'Reset your password';
        html = `<p>Click <a href="${baseUrl}/auth/reset-password?token=${msg.vars.token}">here</a> to reset your password. This link expires in 30 minutes.</p>`;
        break;
      case 'set-password':
        subject = 'Set your password';
        html = `<p>You've been invited to VerifyNG. <a href="${baseUrl}/auth/set-password?token=${msg.vars.token}">Set your password</a>. This link expires in 7 days.</p>`;
        break;
      case 'mfa-enabled':
        subject = 'MFA enabled on your account';
        html = '<p>Two-factor authentication has been enabled on your account.</p>';
        break;
      case 'new-device-login':
        subject = 'New device login';
        html = `<p>A new login was detected from ${msg.vars.device ?? 'an unknown device'}.</p>`;
        break;
    }

    await this.transporter.sendMail({
      from: '"VerifyNG" <noreply@verifyng.local>',
      to: msg.to,
      subject,
      html,
    });
  }
}
