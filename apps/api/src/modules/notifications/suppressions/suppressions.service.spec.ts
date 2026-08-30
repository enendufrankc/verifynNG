import { describe, expect, it, vi } from 'vitest';
import { NotificationChannel } from '@prisma/client';
import { SuppressionsService } from './suppressions.service';

function prismaMock() {
  return {
    notificationSuppression: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

describe('SuppressionsService', () => {
  it('reports suppressed when a matching [channel, recipient] row exists', async () => {
    const prisma = prismaMock();
    prisma.notificationSuppression.findUnique.mockResolvedValue({ id: 'x' });
    const service = new SuppressionsService(prisma as never);

    await expect(
      service.isSuppressed(NotificationChannel.email, 'a@test'),
    ).resolves.toBe(true);
  });

  it('lists both tenant-scoped and platform-wide (global) suppressions for a tenant', async () => {
    const prisma = prismaMock();
    prisma.notificationSuppression.findMany.mockResolvedValue([]);
    const service = new SuppressionsService(prisma as never);

    await service.listSuppressions({ tenantId: 'tenant-1' });

    expect(prisma.notificationSuppression.findMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: 'tenant-1' }, { tenantId: null }] },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lists every suppression when no tenant is given', async () => {
    const prisma = prismaMock();
    prisma.notificationSuppression.findMany.mockResolvedValue([]);
    const service = new SuppressionsService(prisma as never);

    await service.listSuppressions({});

    expect(prisma.notificationSuppression.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });
});
