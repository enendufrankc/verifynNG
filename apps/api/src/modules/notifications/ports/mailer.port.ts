import { InjectionToken } from '@nestjs/common';

export interface SenderIdentity {
  fromName: string;
  fromAddress: string;
  replyTo?: string;
}

export interface MailerMessage {
  to: string;
  from: SenderIdentity;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface MailerResult {
  providerMessageId: string;
}

export const MAILER: InjectionToken<MailerPort> = 'MAILER';

export interface MailerPort {
  send(m: MailerMessage): Promise<MailerResult>;
}
