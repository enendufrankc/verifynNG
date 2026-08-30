import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { EventRouter } from './event-router';
import type { NotificationService } from '../notifications.service';

describe('EventRouter — member resolution against real Postgres', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;

  beforeAll(async () => {
    const testDb = await createTestDatabase(__filename);
    prisma = testDb.prisma;
    schemaName = testDb.schemaName;

    const tenant = await prisma.tenant.create({
      data: { slug: 'router-test', name: 'Router Test Co' },
    });
    tenantId = tenant.id;

    // Mirrors real seeding: tenant membership lives in Membership only.
    // User.tenantId (a separate, unrelated denormalized field) is left null,
    // exactly as packages/db/prisma/seed.ts leaves it for every real member.
    const owner = await prisma.user.create({
      data: { email: 'owner@router-test.local', displayName: 'Owner' },
    });
    const operator = await prisma.user.create({
      data: { email: 'operator@router-test.local', displayName: 'Operator' },
    });
    const viewer = await prisma.user.create({
      data: { email: 'viewer@router-test.local', displayName: 'Viewer' },
    });

    await prisma.membership.createMany({
      data: [
        { userId: owner.id, tenantId, role: 'owner' },
        { userId: operator.id, tenantId, role: 'operator' },
        { userId: viewer.id, tenantId, role: 'viewer' },
      ],
    });

    await prisma.notificationRoutingRule.create({
      data: {
        tenantId,
        eventName: 'report.created',
        templateId: 'report.received',
        channels: ['email'],
        roles: ['owner', 'operator'],
        enabled: true,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('sends to every owner/operator member via Membership, not User.tenantId', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const notificationService = { send } as unknown as NotificationService;
    const router = new EventRouter(
      undefined as never, // EventEmitter2 is unused by dispatch()
      prisma,
      notificationService,
    );

    await router.dispatch('report.created', tenantId, {
      reference: 'RPT-TEST',
    });

    expect(send).toHaveBeenCalledTimes(2);
    const recipients = send.mock.calls.map((call) => call[1].email).sort();
    expect(recipients).toEqual([
      'operator@router-test.local',
      'owner@router-test.local',
    ]);
    for (const call of send.mock.calls) {
      expect(call[0]).toBe('report.received');
      expect(call[3]).toEqual({ tenantId, channel: 'email' });
    }
  });
});
