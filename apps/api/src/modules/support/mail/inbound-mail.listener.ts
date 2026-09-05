import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TicketsService } from '../tickets/tickets.service';

export interface MailInboundEvent {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId?: string;
  inReplyTo?: string;
}

/**
 * Subscribes to `mail.inbound` (see CROSS-EPIC-REQUESTS.md "To E14
 * Notifications") and turns it into a ticket or a reply note — T9.
 */
@Injectable()
export class InboundMailListener {
  private readonly logger = new Logger(InboundMailListener.name);

  constructor(private readonly tickets: TicketsService) {}

  @OnEvent('mail.inbound')
  async handle(event: MailInboundEvent): Promise<void> {
    this.logger.log(`mail.inbound from ${event.from}: ${event.subject}`);
    await this.tickets.createFromInboundMail(event);
  }
}
