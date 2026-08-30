import { Injectable } from '@nestjs/common';
import {
  WhatsAppPort,
  WhatsAppTemplateMessage,
  WhatsAppResult,
} from '../ports/whatsapp.port';

export class NotConfiguredError extends Error {
  constructor(service: string) {
    super(
      `${service} is not configured. Set the required environment variables.`,
    );
    this.name = 'NotConfiguredError';
  }
}

@Injectable()
export class MetaWhatsApp implements WhatsAppPort {
  async sendTemplate(_m: WhatsAppTemplateMessage): Promise<WhatsAppResult> {
    throw new NotConfiguredError('Meta WhatsApp');
  }
}
