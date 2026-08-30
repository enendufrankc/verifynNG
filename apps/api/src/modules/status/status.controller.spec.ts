import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { UnauthorizedException } from '@nestjs/common';

describe('StatusController', () => {
  let controller: StatusController;
  let serviceMock: StatusService;

  beforeEach(() => {
    serviceMock = {
      ingestProbe: vi.fn().mockResolvedValue({ id: 'probe-1' }),
      getOverallStatus: vi.fn().mockResolvedValue({ state: 'operational' }),
      getHistory: vi.fn().mockResolvedValue([]),
    } as unknown as StatusService;

    controller = new StatusController(serviceMock);
  });

  it('rejects probe ingest without valid x-synthetic-probe header', async () => {
    await expect(
      controller.ingestProbe(
        { target: 'verify-api', ok: true, latencyMs: 30 },
        'invalid-key',
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts probe ingest with valid header', async () => {
    const result = await controller.ingestProbe(
      { target: 'verify-api', ok: true, latencyMs: 30 },
      'probe-secret-local',
    );
    expect(result).toEqual({ id: 'probe-1' });
  });

  it('returns overall status', async () => {
    const res = await controller.getStatus();
    expect(res).toEqual({ state: 'operational' });
  });
});
