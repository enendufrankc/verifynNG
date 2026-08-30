import { InjectionToken } from '@nestjs/common';

export interface WhatsAppTemplateMessage {
  to: string;
  template: string;
  params: Record<string, string>;
}

export interface WhatsAppResult {
  providerMessageId: string;
}

export const WHATSAPP: InjectionToken<WhatsAppPort> = 'WHATSAPP';

export interface WhatsAppPort {
  sendTemplate(m: WhatsAppTemplateMessage): Promise<WhatsAppResult>;
}
