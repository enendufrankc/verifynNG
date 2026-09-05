/**
 * AuditService — tamper-evident, hash-chained audit log.
 *
 * Every mutating action in the platform is recorded as an append-only row
 * with a SHA-256 chain hash. The chain head is locked via SELECT FOR UPDATE
 * on a single-row audit_chain_head table to prevent stale prevHash under concurrency.
 */

import { Injectable } from '@nestjs/common';
import { PrismaClient, AuditLog, AuditActorType, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { canonicalize } from '@verifynng/core';
import crypto from 'node:crypto';

/** Keys whose values are redacted before hashing and storage */
const REDACT_KEYS = [
  'password',
  'token',
  'secret',
  'code',
  'tier2code',
  'authorization',
];

export interface AuditActor {
  type: 'user' | 'system' | 'oem' | 'support' | 'apikey';
  id?: string;
  ip?: string;
}

export interface AuditTarget {
  type: string;
  id: string;
}

export interface AuditEntry {
  tenantId?: string;
  actor: AuditActor;
  action: string;
  target: AuditTarget;
  payload?: Record<string, unknown>;
  requestId?: string;
  /**
   * E18 — set when this action happened during an impersonated request.
   * Deliberately NOT part of the hash-chain input below: adding it there
   * would change the canonicalized hash for every row going forward without
   * a chain reset, breaking verifyChain() for every row written before this
   * field existed. See docs/epics/CROSS-EPIC-REQUESTS.md "To E13".
   */
  impersonatedBy?: string;
  impersonationSessionId?: string;
}

export interface AuditPage {
  items: AuditLog[];
  cursor?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record an audit entry. Uses a transaction with SELECT FOR UPDATE
   * on audit_chain_head to guarantee hash-chain integrity under concurrency.
   */
  async record(entry: AuditEntry): Promise<AuditLog> {
    const redacted = entry.payload ? this.redact(entry.payload) : {};

    const row = await this.prisma.$transaction(async (tx) => {
      // Lock the chain head
      const head = await tx.$queryRaw<
        Array<{ prevHash: string; lastSeq: bigint }>
      >`SELECT "prevHash", "lastSeq" FROM "audit_chain_head" WHERE id = 1 FOR UPDATE`;

      const prevHash = head[0].prevHash;
      const seq = head[0].lastSeq + 1n;
      // Fixed at compute time and persisted verbatim below — verifyChain() recomputes
      // the hash from the stored row, so the hash input and the stored createdAt must
      // be the exact same value, not two separate `now()` calls.
      const createdAt = new Date();

      // Compute hash: sha256(prevHash || canonicalize(fields))
      const hashInput = {
        seq: Number(seq),
        tenantId: entry.tenantId ?? null,
        actorType: entry.actor.type,
        actorId: entry.actor.id ?? null,
        actorIp: entry.actor.ip ?? null,
        requestId: entry.requestId ?? null,
        action: entry.action,
        targetType: entry.target.type,
        targetId: entry.target.id,
        payload: redacted,
        createdAt: createdAt.toISOString(),
      };
      const hash = crypto
        .createHash('sha256')
        .update(prevHash + canonicalize(hashInput))
        .digest('hex');

      // Insert the audit row
      const created = await tx.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actorId: entry.actor.id,
          action: entry.action,
          target: `${entry.target.type}:${entry.target.id}`,
          payload: redacted as Prisma.InputJsonValue,
          prevHash,
          hash,
          seq,
          createdAt,
          actorType: entry.actor.type as AuditActorType,
          actorIp: entry.actor.ip,
          requestId: entry.requestId,
          targetType: entry.target.type,
          targetId: entry.target.id,
          impersonatedBy: entry.impersonatedBy,
          impersonationSessionId: entry.impersonationSessionId,
        },
      });

      // Update the chain head
      await tx.$executeRaw`UPDATE "audit_chain_head" SET "prevHash" = ${hash}, "lastSeq" = ${seq} WHERE id = 1`;

      return created;
    });

    // Emit event (outside transaction)
    this.eventEmitter.emit('audit.recorded', {
      id: row.id,
      seq: Number(row.seq),
      tenantId: row.tenantId,
      action: row.action,
      target: { type: row.targetType, id: row.targetId },
      actorType: row.actorType,
      createdAt: row.createdAt,
    });

    return row;
  }

  /**
   * Query audit log with filters and cursor pagination.
   */
  async query(filter: {
    tenantId?: string;
    actorId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
    /** E18 — "impersonated" filter chip: true = impersonatedBy is set. */
    impersonated?: boolean;
  }): Promise<AuditPage> {
    const limit = Math.min(filter.limit ?? 50, 200);

    const where: Prisma.AuditLogWhereInput = {};
    if (filter.tenantId) where.tenantId = filter.tenantId;
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.action) where.action = { contains: filter.action };
    if (filter.targetType) where.targetType = filter.targetType;
    if (filter.targetId) where.targetId = filter.targetId;
    if (filter.impersonated) where.impersonatedBy = { not: null };
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    if (filter.cursor) {
      // cursor is the seq as string
      const cursorSeq = BigInt(filter.cursor);
      where.seq = { lt: cursorSeq };
    }

    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });

    let cursor: string | undefined;
    if (items.length > limit) {
      const last = items.pop()!;
      cursor = last.seq.toString();
    }

    return { items, cursor };
  }

  /**
   * Redact sensitive keys from payload before hashing and storage.
   */
  redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (
        REDACT_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))
      ) {
        result[key] = '[REDACTED]';
      } else if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
