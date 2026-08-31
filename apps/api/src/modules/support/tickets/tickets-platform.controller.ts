import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { PlatformRole, Principal } from '../../../common/tenant';
import type { UserPrincipal } from '../../auth/types/principal';
import { Audited } from '../../audit/audited.decorator.js';
import { AddNoteDto } from './dto/add-note.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import {
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from './dto/canned-response.dto';
import { CannedResponsesService } from './canned-responses.service';
import { TicketsService } from './tickets.service';

@Controller('v1/platform/tickets')
@PlatformRole('support')
export class TicketsPlatformController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('assigneeId') assigneeId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.tickets.list({
      status,
      priority,
      assigneeId,
      tenantId,
      cursor,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tickets.get(id);
  }

  @Patch(':id')
  @Audited('ticket.updated')
  update(
    @Param('id') id: string,
    @Principal() principal: UserPrincipal,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.tickets.update(id, principal.userId, dto);
  }

  @Post(':id/notes')
  @Audited('ticket.note_added')
  addNote(
    @Param('id') id: string,
    @Principal() principal: UserPrincipal,
    @Body() dto: AddNoteDto,
  ) {
    return this.tickets.addNote(id, {
      kind: dto.kind,
      body: dto.body ?? '',
      authorId: principal.userId,
      cannedResponseId: dto.cannedResponseId,
    });
  }
}

@Controller('v1/platform/canned-responses')
@PlatformRole('support')
export class CannedResponsesController {
  constructor(private readonly cannedResponses: CannedResponsesService) {}

  @Get()
  list() {
    return this.cannedResponses.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cannedResponses.get(id);
  }

  @Post()
  @Audited('canned_response.created')
  create(@Body() dto: CreateCannedResponseDto) {
    return this.cannedResponses.create(dto);
  }

  @Patch(':id')
  @Audited('canned_response.updated')
  update(@Param('id') id: string, @Body() dto: UpdateCannedResponseDto) {
    return this.cannedResponses.update(id, dto);
  }

  @Delete(':id')
  @Audited('canned_response.deleted')
  remove(@Param('id') id: string) {
    return this.cannedResponses.remove(id);
  }
}
