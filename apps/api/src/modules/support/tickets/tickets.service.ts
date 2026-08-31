import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PrismaClient,
  Ticket,
  TicketNoteKind,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { parseCode, redactCode } from '@verifynng/core';
import { NotificationService } from '../../notifications/notifications.service';
import { CannedResponsesService } from './canned-responses.service';
import {
  canTransition,
  nextStatusOnInboundReply,
} from './ticket-status-machine';

export interface TicketPage {
  items: Ticket[];
  cursor?: string;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationService,
    private readonly cannedResponses: CannedResponsesService,
  ) {}

  private helpTicketsUrl(): string {
    return `${this.config.get<string>('APP_BASE_URL', 'http://localhost:3001')}/help/tickets`;
  }

  async createFromConsole(
    tenantId: string,
    requesterUserId: string,
    dto: { subject: string; body: string; pageUrl?: string },
  ): Promise<Ticket> {
    const requester = await this.prisma.user.findUniqueOrThrow({
      where: { id: requesterUserId },
      select: { email: true },
    });
    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId,
        requesterEmail: requester.email,
        requesterUserId,
        channel: 'console',
        subject: dto.subject,
        body: dto.body,
        pageUrl: dto.pageUrl,
      },
    });
    await this.afterCreate(ticket);
    await this.notifications.send(
      'ticket.created',
      { email: requester.email, userId: requesterUserId },
      {
        ticketNumber: ticket.number,
        subject: ticket.subject,
        statusUrl: this.helpTicketsUrl(),
      },
      { tenantId },
    );
    return ticket;
  }

  async createFromPublicForm(dto: {
    email: string;
    subject: string;
    body: string;
    code?: string;
  }): Promise<Ticket> {
    let tenantId: string | null = null;
    let relatedCode: string | undefined;
    if (dto.code) {
      const parsed = parseCode(dto.code);
      if (parsed) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: parsed.tenant },
        });
        tenantId = tenant?.id ?? null;
        relatedCode = redactCode(dto.code);
      }
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId: tenantId ?? undefined,
        requesterEmail: dto.email,
        channel: 'public',
        subject: dto.subject,
        body: dto.body,
        relatedCode,
      },
    });
    await this.afterCreate(ticket);
    await this.notifications.send(
      'ticket.created',
      { email: dto.email },
      {
        ticketNumber: ticket.number,
        subject: ticket.subject,
        statusUrl: `${this.config.get<string>('VERIFY_BASE_URL', 'http://localhost:3000')}/support`,
      },
    );
    return ticket;
  }

  /**
   * `support@` inbound mail. Matches a reply to an existing ticket by
   * `In-Reply-To` header first, then by `[#N]` in the subject; neither
   * match creates a new ticket. See T9 in docs/epics/E18-support-tooling.md.
   */
  async createFromInboundMail(msg: {
    from: string;
    subject: string;
    text: string;
    messageId?: string;
    inReplyTo?: string;
  }): Promise<Ticket> {
    const existing = await this.findByThread(msg.inReplyTo, msg.subject);
    if (existing) {
      await this.addNote(existing.id, {
        kind: 'reply',
        body: msg.text,
        authorId: null,
      });
      return this.prisma.ticket.findUniqueOrThrow({
        where: { id: existing.id },
      });
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        requesterEmail: msg.from,
        channel: 'email',
        subject: msg.subject,
        body: msg.text,
        emailThreadId: msg.messageId,
      },
    });
    await this.afterCreate(ticket);
    return ticket;
  }

  private async findByThread(
    inReplyTo: string | undefined,
    subject: string,
  ): Promise<Ticket | null> {
    if (inReplyTo) {
      const byThread = await this.prisma.ticket.findFirst({
        where: { emailThreadId: inReplyTo },
      });
      if (byThread) return byThread;
    }
    const match = subject.match(/\[#(\d+)\]/);
    if (match) {
      return this.prisma.ticket.findFirst({
        where: { number: Number(match[1]) },
      });
    }
    return null;
  }

  private async afterCreate(ticket: Ticket): Promise<void> {
    this.eventEmitter.emit('ticket.created', {
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      channel: ticket.channel,
      priority: ticket.priority,
      requesterEmail: ticket.requesterEmail,
    });
  }

  list(filter: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    tenantId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<TicketPage> {
    return this.paginate(
      {
        status: filter.status,
        priority: filter.priority,
        assigneeId: filter.assigneeId,
        tenantId: filter.tenantId,
      },
      filter.cursor,
      filter.limit,
    );
  }

  /** Own tenant's tickets — `GET /v1/tenants/:tenantId/support/tickets`. */
  listForTenant(
    tenantId: string,
    requesterUserId: string,
  ): Promise<TicketPage> {
    return this.paginate({ tenantId, requesterUserId }, undefined, 100);
  }

  private async paginate(
    where: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string;
      tenantId?: string;
      requesterUserId?: string;
    },
    cursor?: string,
    limit = 50,
  ): Promise<TicketPage> {
    const take = Math.min(limit, 200);
    const items = await this.prisma.ticket.findMany({
      where,
      // Unassigned first, then oldest-touched first.
      orderBy: [{ assigneeId: 'asc' }, { lastActivityAt: 'asc' }],
      include: { notes: { orderBy: { createdAt: 'asc' } } },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    });
    let nextCursor: string | undefined;
    if (items.length > take) nextCursor = items.pop()!.id;
    return { items, cursor: nextCursor };
  }

  async get(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { notes: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('ticket_not_found');
    return ticket;
  }

  async update(
    id: string,
    actorId: string,
    dto: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string;
    },
  ) {
    const ticket = await this.get(id);
    if (dto.status && dto.status !== ticket.status) {
      if (!canTransition(ticket.status, dto.status)) {
        throw new BadRequestException({
          error: 'illegal_status_transition',
          from: ticket.status,
          to: dto.status,
        });
      }
      this.eventEmitter.emit('ticket.status_changed', {
        ticketId: id,
        from: ticket.status,
        to: dto.status,
        actorId,
      });
    }
    return this.prisma.ticket.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        lastActivityAt: new Date(),
        ...(dto.status === 'resolved' ? { resolvedAt: new Date() } : {}),
      },
    });
  }

  async addNote(
    ticketId: string,
    dto: {
      kind: TicketNoteKind;
      body: string;
      authorId?: string | null;
      cannedResponseId?: string;
    },
  ) {
    const ticket = await this.get(ticketId);

    const body = dto.cannedResponseId
      ? await this.cannedResponses.renderById(dto.cannedResponseId, {
          ticketNumber: ticket.number,
          requesterEmail: ticket.requesterEmail,
        })
      : dto.body;

    const note = await this.prisma.ticketNote.create({
      data: {
        ticketId,
        authorId: dto.authorId ?? undefined,
        kind: dto.kind,
        body,
      },
    });

    const nextStatus =
      dto.kind === 'reply' && dto.authorId == null
        ? nextStatusOnInboundReply(ticket.status)
        : ticket.status;

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        lastActivityAt: new Date(),
        status: nextStatus,
      },
    });

    if (nextStatus !== ticket.status) {
      this.eventEmitter.emit('ticket.status_changed', {
        ticketId,
        from: ticket.status,
        to: nextStatus,
        actorId: 'system',
      });
    }

    // A support agent's reply goes out over email; an inbound reply or an
    // internal note never triggers an outbound send.
    if (dto.kind === 'reply' && dto.authorId) {
      await this.notifications.send(
        'ticket.replied',
        { email: ticket.requesterEmail },
        {
          ticketNumber: ticket.number,
          subject: `${ticket.subject} [#${ticket.number}]`,
          replyBody: body,
          statusUrl: this.helpTicketsUrl(),
        },
        { tenantId: ticket.tenantId ?? undefined },
      );
    }

    return note;
  }
}
