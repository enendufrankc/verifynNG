import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { AuditChainService } from './audit-chain.service.js';

describe('AuditChainService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let auditService: AuditService;
  let chainService: AuditChainService;

  beforeAll(async () => {
    const db = await createTestDatabase('audit-chain-service-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    auditService = new AuditService(prisma, new EventEmitter2());
    chainService = new AuditChainService(prisma);
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  it('reports ok for an untampered chain', async () => {
    await auditService.record({
      actor: { type: 'system' },
      action: 'test.chain.a',
      target: { type: 'test', id: '1' },
    });
    await auditService.record({
      actor: { type: 'system' },
      action: 'test.chain.b',
      target: { type: 'test', id: '2' },
    });

    const result = await chainService.verifyChain();

    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(2);
    expect(result.firstBadSeq).toBeUndefined();
  });

  it('detects a superuser edit that bypassed the immutability trigger (AC2)', async () => {
    const tampered = await auditService.record({
      actor: { type: 'system' },
      action: 'test.chain.tamper',
      target: { type: 'test', id: '3' },
      payload: { original: true },
    });
    await auditService.record({
      actor: { type: 'system' },
      action: 'test.chain.after',
      target: { type: 'test', id: '4' },
    });

    // Simulate the migration superuser's tamper drill from AC2.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_immutable',
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "AuditLog" SET payload = '{}' WHERE seq = ${tampered.seq}`,
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_immutable',
    );

    const result = await chainService.verifyChain();

    expect(result.ok).toBe(false);
    expect(result.firstBadSeq).toBe(tampered.seq);
  });
});
