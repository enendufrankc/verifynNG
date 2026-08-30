import { describe, expect, it, vi } from 'vitest';
import { OemsService } from './oems.service';

describe('OemsService events', () => {
  it('emits oem.created after creating an OEM', async () => {
    const oem = { id: 'o1', tenantId: 't1', name: 'Factory' };
    const prisma = { oem: { create: async () => oem } } as never;
    const events = { emit: vi.fn().mockResolvedValue(undefined) };
    const service = new OemsService(prisma, events as never);

    await service.create('t1', { name: 'Factory' });

    expect(events.emit).toHaveBeenCalledWith(
      'oem.created',
      expect.objectContaining({ tenantId: 't1', oemId: 'o1', name: 'Factory' }),
    );
  });

  it('emits oem.status.changed with the previous and next status', async () => {
    const existing = { id: 'o1', tenantId: 't1', status: 'active' };
    const updated = { ...existing, status: 'suspended' };
    const prisma = {
      oem: {
        findFirst: async () => existing,
        update: async () => updated,
      },
    } as never;
    const events = { emit: vi.fn().mockResolvedValue(undefined) };
    const service = new OemsService(prisma, events as never);

    await service.setStatus('t1', 'o1', 'suspended');

    expect(events.emit).toHaveBeenCalledWith(
      'oem.status.changed',
      expect.objectContaining({
        tenantId: 't1',
        oemId: 'o1',
        from: 'active',
        to: 'suspended',
      }),
    );
  });
});
