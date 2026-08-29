/**
 * AuditChainService — verifies integrity of the hash chain.
 *
 * Streams rows by seq, recomputes hashes, writes AuditChainCheckpoint.
 * Used by the periodic BullMQ job and the on-demand POST endpoint.
 */

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { canonicalize } from '@verifynng/core';
import crypto from 'node:crypto';

export interface ChainVerificationResult {
  ok: boolean;
  rowsChecked: number;
  firstBadSeq?: bigint;
  fromSeq: bigint;
  toSeq: bigint;
  headHash: string;
}

@Injectable()
export class AuditChainService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Verify the hash chain integrity.
   * Streams rows by seq, recomputes each hash, compares to stored hash.
   */
  async verifyChain(opts?: {
    fromSeq?: bigint;
    toSeq?: bigint;
    triggeredById?: string;
  }): Promise<ChainVerificationResult> {
    // Determine range
    const rangeStart = opts?.fromSeq ?? 1n;

    // Get the max seq
    const maxSeqRow = await this.prisma.auditLog.aggregate({
      _max: { seq: true },
    });
    const rangeEnd = opts?.toSeq ?? maxSeqRow._max.seq ?? 0n;

    if (rangeEnd < rangeStart || rangeEnd === 0n) {
      // No rows to check
      await this.prisma.auditChainCheckpoint.create({
        data: {
          fromSeq: rangeStart,
          toSeq: rangeEnd,
          headHash: 'GENESIS',
          ok: true,
          rowsChecked: 0,
          triggeredById: opts?.triggeredById,
        },
      });
      return {
        ok: true,
        rowsChecked: 0,
        fromSeq: rangeStart,
        toSeq: rangeEnd,
        headHash: 'GENESIS',
      };
    }

    // Stream rows in order
    let prevHash = 'GENESIS';
    let rowsChecked = 0;
    let firstBadSeq: bigint | undefined;
    let currentHash = 'GENESIS';

    const rows = await this.prisma.auditLog.findMany({
      where: {
        seq: { gte: rangeStart, lte: rangeEnd },
      },
      orderBy: { seq: 'asc' },
    });

    for (const row of rows) {
      rowsChecked++;

      // Verify prevHash matches
      if (row.prevHash !== prevHash) {
        if (firstBadSeq === undefined) {
          firstBadSeq = row.seq;
        }
      }

      // Recompute hash
      const hashInput = {
        seq: Number(row.seq),
        tenantId: row.tenantId,
        actorType: row.actorType,
        actorId: row.actorId,
        actorIp: row.actorIp,
        requestId: row.requestId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      };
      const expectedHash = crypto
        .createHash('sha256')
        .update(prevHash + canonicalize(hashInput))
        .digest('hex');

      if (row.hash !== expectedHash) {
        if (firstBadSeq === undefined) {
          firstBadSeq = row.seq;
        }
      }

      prevHash = row.hash;
      currentHash = row.hash;
    }

    const ok = firstBadSeq === undefined;

    // Write checkpoint
    await this.prisma.auditChainCheckpoint.create({
      data: {
        fromSeq: rangeStart,
        toSeq: rangeEnd,
        headHash: currentHash,
        ok,
        rowsChecked,
        firstBadSeq,
        triggeredById: opts?.triggeredById,
      },
    });

    return {
      ok,
      rowsChecked,
      firstBadSeq,
      fromSeq: rangeStart,
      toSeq: rangeEnd,
      headHash: currentHash,
    };
  }

  /**
   * Get the latest checkpoint.
   */
  async getLatestCheckpoint() {
    return this.prisma.auditChainCheckpoint.findFirst({
      orderBy: { createdAt: 'desc' },
    });
  }
}
