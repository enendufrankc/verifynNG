/**
 * Dev-only endpoint the CLI (support:simulate-inbound) calls after sending
 * the real SMTP message to Mailpit — see simulate-inbound.command.ts's own
 * comment for why a CLI process talks to the already-running API over HTTP
 * instead of bootstrapping the full AppModule in-process (a transitive
 * dependency of a completely unrelated module broke that path under tsx's
 * strict ESM resolution). Present only when NODE_ENV !== 'production'.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Public } from '../../../common/tenant';
import { TicketsService } from '../tickets/tickets.service';

class SimulateInboundDto {
  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  inReplyTo?: string;
}

@Controller('v1/_dev/support/simulate-inbound')
@Public()
export class DevSimulateInboundController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  simulate(@Body() dto: SimulateInboundDto) {
    return this.tickets.createFromInboundMail(dto);
  }
}
