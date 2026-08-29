import { metrics, Counter, Histogram, UpDownCounter } from '@opentelemetry/api';

const meter = metrics.getMeter('verifynng-api', '1.0.0');

export class Metrics {
  static verifyLatency: Histogram = meter.createHistogram('verify_latency_ms', {
    description: 'Latency of unit code verification in milliseconds',
    unit: 'ms',
  });

  static verifyVerdicts: Counter = meter.createCounter(
    'verify_verdicts_total',
    {
      description: 'Total number of verification attempts by verdict',
    },
  );

  static rateLimitHits: Counter = meter.createCounter('rate_limit_hits_total', {
    description: 'Total number of rate limit hits',
  });

  static queueDepth: UpDownCounter = meter.createUpDownCounter('queue_depth', {
    description: 'Current depth of BullMQ queue',
  });

  static queueLag: Histogram = meter.createHistogram('queue_lag_ms', {
    description: 'Oldest waiting job lag in BullMQ queue',
    unit: 'ms',
  });

  static dbPoolInUse: UpDownCounter = meter.createUpDownCounter(
    'db_pool_in_use',
    {
      description: 'Active database connections in pool',
    },
  );

  static probeSuccess: UpDownCounter = meter.createUpDownCounter(
    'probe_success',
    {
      description: 'Synthetic probe success state (1=ok, 0=failed)',
    },
  );
}
