import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from './audit.service.js';

describe('AuditService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let service: AuditService;

  beforeAll(async () => {
    const db = await createTestDatabase('audit-service-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    service = new AuditService(prisma, new EventEmitter2());
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  it('redacts configured keys before hashing and storage', async () => {
    const row = await service.record({
      actor: { type: 'system' },
      action: 'test.redact',
      target: { type: 'test', id: '1' },
      payload: { password: 'hunter2', tier2Code: 'abc', keep: 'visible' },
    });

    expect(row.payload).toEqual({
      password: '[REDACTED]',
      tier2Code: '[REDACTED]',
      keep: 'visible',
    });
  });

  it('produces a gapless, verifiable hash chain under 200 concurrent records', async () => {
    // Issued in waves of 25 in-flight transactions — enough to stress the chain-head
    // row lock without exceeding Prisma's default transaction pool for the test DB.
    const total = 200;
    const waveSize = 25;
    const results = [];
    for (let start = 0; start < total; start += waveSize) {
      const wave = await Promise.all(
        Array.from({ length: Math.min(waveSize, total - start) }, (_, i) =>
          service.record({
            actor: { type: 'system' },
            action: 'test.concurrent',
            target: { type: 'test', id: String(start + i) },
          }),
        ),
      );
      results.push(...wave);
    }

    const seqs = results
      .map((r) => r.seq)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i] - seqs[i - 1]).toBe(1n);
    }

    const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    let prevHash = 'GENESIS';
    for (const row of rows) {
      expect(row.prevHash).toBe(prevHash);
      prevHash = row.hash;
    }
  });

  it('rejects UPDATE and DELETE on AuditLog (append-only trigger)', async () => {
    const row = await service.record({
      actor: { type: 'system' },
      action: 'test.immutable',
      target: { type: 'test', id: '1' },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "AuditLog" SET action = 'x' WHERE id = '${row.id}'`,
      ),
    ).rejects.toThrow(/append-only/);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = '${row.id}'`),
    ).rejects.toThrow(/append-only/);
  });
});
