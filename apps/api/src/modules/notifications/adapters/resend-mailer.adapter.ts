import { Injectable } from '@nestjs/common';
import { MailerPort, MailerMessage, MailerResult } from '../ports/mailer.port';

@Injectable()
export class ResendMailer implements MailerPort {
  async send(_m: MailerMessage): Promise<MailerResult> {
    throw new Error('ResendMailer not yet implemented');
  }
}
