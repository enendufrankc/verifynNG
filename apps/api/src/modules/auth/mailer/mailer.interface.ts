export interface MailMessage {
  to: string;
  template: 'password-reset' | 'mfa-enabled' | 'new-device-login' | 'set-password';
  vars: Record<string, string>;
}

export const MAILER = Symbol('MAILER');

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}
