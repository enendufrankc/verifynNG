import { describe, it, expect, vi } from 'vitest';
import { AlertsService } from './alerts.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('AlertsService', () => {
  it('emits ops.alert.fired event on firing alert webhook', () => {
    const emitterMock = { emit: vi.fn() } as unknown as EventEmitter2;
    const service = new AlertsService(emitterMock);

    service.processAlertWebhook({
      status: 'firing',
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'ProbeFailing', severity: 'page' },
          annotations: { summary: 'Probe failed 2 consecutive times' },
          startsAt: '2026-08-29T08:00:00Z',
        },
      ],
    });

    expect(emitterMock.emit).toHaveBeenCalledWith(
      'ops.alert.fired',
      expect.objectContaining({
        alertName: 'ProbeFailing',
        severity: 'page',
        summary: 'Probe failed 2 consecutive times',
      }),
    );
  });
});
