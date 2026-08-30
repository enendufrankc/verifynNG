import { describe, it, expect } from 'vitest';
import { Metrics } from './metrics';

describe('Metrics', () => {
  it('defines all required OTel instruments', () => {
    expect(Metrics.verifyLatency).toBeDefined();
    expect(Metrics.verifyVerdicts).toBeDefined();
    expect(Metrics.rateLimitHits).toBeDefined();
    expect(Metrics.queueDepth).toBeDefined();
    expect(Metrics.queueLag).toBeDefined();
    expect(Metrics.dbPoolInUse).toBeDefined();
    expect(Metrics.probeSuccess).toBeDefined();
  });

  it('can record verify metrics without throwing', () => {
    expect(() => {
      Metrics.verifyLatency.record(45, {
        tier: '1',
        verdict: 'ok',
        tenantId: 't1',
      });
      Metrics.verifyVerdicts.add(1, {
        tier: '1',
        verdict: 'ok',
        tenantId: 't1',
      });
      Metrics.rateLimitHits.add(1, { scope: 'ip' });
      Metrics.probeSuccess.add(1, { target: 'verify-api' });
    }).not.toThrow();
  });
});
