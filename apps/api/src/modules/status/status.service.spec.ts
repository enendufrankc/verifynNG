import { describe, it, expect, vi } from 'vitest';
import { StatusService } from './status.service';
import { PrismaClient } from '@verifynng/db';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('StatusService', () => {
  it('derives operational state when all recent probes succeeded', async () => {
    const prismaMock = {
      probeResult: {
        findMany: vi.fn().mockResolvedValue([
          { ok: true, latencyMs: 50 },
          { ok: true, latencyMs: 45 },
          { ok: true, latencyMs: 60 },
          { ok: true, latencyMs: 40 },
          { ok: true, latencyMs: 55 },
        ]),
      },
    } as unknown as PrismaClient;

    const emitterMock = { emit: vi.fn() } as unknown as EventEmitter2;
    const service = new StatusService(emitterMock, prismaMock);

    const state = await service.deriveComponentState('verify-api');
    expect(state).toBe('operational');
  });

  it('derives outage state when 3 or more of last 5 probes failed', async () => {
    const prismaMock = {
      probeResult: {
        findMany: vi.fn().mockResolvedValue([
          { ok: false, latencyMs: 500 },
          { ok: false, latencyMs: 500 },
          { ok: false, latencyMs: 500 },
          { ok: true, latencyMs: 40 },
          { ok: true, latencyMs: 55 },
        ]),
      },
    } as unknown as PrismaClient;

    const emitterMock = { emit: vi.fn() } as unknown as EventEmitter2;
    const service = new StatusService(emitterMock, prismaMock);

    const state = await service.deriveComponentState('verify-api');
    expect(state).toBe('outage');
  });
});
