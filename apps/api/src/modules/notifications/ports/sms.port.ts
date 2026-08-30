import { InjectionToken } from '@nestjs/common';

export interface SmsMessage {
  to: string;
  body: string;
  from?: string;
}

export interface SmsResult {
  providerMessageId: string;
}

export const SMS: InjectionToken<SmsPort> = 'SMS';

export interface SmsPort {
  send(m: SmsMessage): Promise<SmsResult>;
}
