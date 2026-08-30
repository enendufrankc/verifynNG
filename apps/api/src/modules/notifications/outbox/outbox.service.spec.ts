import { describe, expect, it, vi } from 'vitest';
import { NotificationChannel, OutboxStatus } from '@prisma/client';
import { OutboxService, deriveIdempotencyKey } from './outbox.service';

function prismaMock() {
  return {
    notificationOutbox: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    notificationDeliveryEvent: { create: vi.fn() },
  };
}

describe('OutboxService', () => {
  it('derives stable keys independent of object key order', () => {
    expect(
      deriveIdempotencyKey('notification.test', 'a@test', { b: 2, a: 1 }),
    ).toBe(deriveIdempotencyKey('notification.test', 'a@test', { a: 1, b: 2 }));
  });

  it('returns an existing row without creating a duplicate', async () => {
    const prisma = prismaMock();
    prisma.notificationOutbox.findUnique.mockResolvedValue({
      id: 'existing',
      status: OutboxStatus.sent,
    });
    const service = new OutboxService(prisma as never);

    await expect(
      service.createOutboxRow({
        templateId: 'notification.test',
        channel: NotificationChannel.email,
        recipient: 'a@test',
        data: { a: 1 },
        idempotencyKey: 'demo-1',
      }),
    ).resolves.toEqual({
      id: 'existing',
      status: OutboxStatus.sent,
      isDuplicate: true,
    });
    expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it('creates a queued row and records its initial delivery event', async () => {
    const prisma = prismaMock();
    prisma.notificationOutbox.findUnique.mockResolvedValue(null);
    prisma.notificationOutbox.create.mockResolvedValue({
      id: 'new-row',
      status: OutboxStatus.queued,
    });
    const service = new OutboxService(prisma as never);

    await expect(
      service.createOutboxRow({
        templateId: 'notification.test',
        channel: NotificationChannel.email,
        recipient: 'a@test',
        data: { a: 1 },
        idempotencyKey: 'demo-2',
      }),
    ).resolves.toEqual({
      id: 'new-row',
      status: OutboxStatus.queued,
      isDuplicate: false,
    });
    expect(prisma.notificationDeliveryEvent.create).toHaveBeenCalledWith({
      data: { outboxId: 'new-row', type: 'queued', providerPayload: undefined },
    });
  });
});
