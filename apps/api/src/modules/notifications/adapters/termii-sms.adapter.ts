import { Injectable } from '@nestjs/common';
import { SmsPort, SmsMessage, SmsResult } from '../ports/sms.port';

@Injectable()
export class TermiiSms implements SmsPort {
  async send(_m: SmsMessage): Promise<SmsResult> {
    throw new Error('TermiiSms not yet implemented');
  }
}
