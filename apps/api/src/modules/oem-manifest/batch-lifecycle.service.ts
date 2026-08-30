import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, Batch, BatchStatus, Prisma } from '@prisma/client';
import { EventsService } from '../../common/events.service';

export interface TransitionActor {
  type: 'user' | 'oem' | 'system';
  id?: string;
}

/**
 * The E05 slice of the batch state machine. E04's `minting`/`failed` states are
 * pre-delivery and out of scope here; `close` is the one transition an owner can
 * fire from any non-terminal E05 state.
 */
const FORWARD: Partial<Record<BatchStatus, BatchStatus>> = {
  minted: 'delivered',
  delivered: 'printed',
  printed: 'shipped',
};

const CLOSABLE_FROM: BatchStatus[] = [
  'minted',
  'delivered',
  'printed',
  'shipped',
];

@Injectable()
export class BatchLifecycleService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private events: EventsService,
  ) {}

  canTransition(from: BatchStatus, to: BatchStatus): boolean {
    if (to === 'closed') return CLOSABLE_FROM.includes(from);
    return FORWARD[from] === to;
  }

  async expectedShipDate(batchId: string): Promise<Date | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { expectedShipDate: true },
    });
    return batch?.expectedShipDate ?? null;
  }

  /**
   * Enforces the transition table, persists the new status (plus any extra
   * columns the caller wants written atomically with it), and emits
   * `batch.status.changed`.
   */
  async transition(
    tenantId: string,
    batchId: string,
    to: BatchStatus,
    actor: TransitionActor,
    extra?: Prisma.BatchUpdateInput,
  ): Promise<Batch> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    if (!this.canTransition(batch.status, to)) {
      throw new ConflictException({
        error: 'illegal_transition',
        message: `illegal_transition ${batch.status}→${to}`,
        from: batch.status,
        to,
      });
    }

    const updated = await this.prisma.batch.update({
      where: { id: batchId },
      data: { ...extra, status: to },
    });

    await this.events.emit('batch.status.changed', {
      tenantId,
      batchId,
      from: batch.status,
      to,
      actor,
      at: new Date(),
    });

    return updated;
  }
}
