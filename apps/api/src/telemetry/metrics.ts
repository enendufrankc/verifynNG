import { metrics, Counter, Histogram, UpDownCounter } from '@opentelemetry/api';

/**
 * Instruments are created lazily on first use (not at module-load time).
 * `startOtel()` registers the real MeterProvider before any HTTP request is
 * handled, but AppModule (and therefore this module) is required before
 * `startOtel()` runs — creating instruments eagerly at import time would
 * bind them to the no-op provider and drop every recorded data point.
 */
function getMeter() {
  return metrics.getMeter('verifynng-api', '1.0.0');
}

let _verifyLatency: Histogram | undefined;
let _verifyVerdicts: Counter | undefined;
let _rateLimitHits: Counter | undefined;
let _queueDepth: UpDownCounter | undefined;
let _queueLag: Histogram | undefined;
let _dbPoolInUse: UpDownCounter | undefined;
let _probeSuccess: UpDownCounter | undefined;

export class Metrics {
  static get verifyLatency(): Histogram {
    return (_verifyLatency ??= getMeter().createHistogram('verify_latency_ms', {
      description: 'Latency of unit code verification in milliseconds',
      unit: 'ms',
    }));
  }

  static get verifyVerdicts(): Counter {
    return (_verifyVerdicts ??= getMeter().createCounter(
      'verify_verdicts_total',
      { description: 'Total number of verification attempts by verdict' },
    ));
  }

  static get rateLimitHits(): Counter {
    return (_rateLimitHits ??= getMeter().createCounter(
      'rate_limit_hits_total',
      { description: 'Total number of rate limit hits' },
    ));
  }

  static get queueDepth(): UpDownCounter {
    return (_queueDepth ??= getMeter().createUpDownCounter('queue_depth', {
      description: 'Current depth of BullMQ queue',
    }));
  }

  static get queueLag(): Histogram {
    return (_queueLag ??= getMeter().createHistogram('queue_lag_ms', {
      description: 'Oldest waiting job lag in BullMQ queue',
      unit: 'ms',
    }));
  }

  static get dbPoolInUse(): UpDownCounter {
    return (_dbPoolInUse ??= getMeter().createUpDownCounter('db_pool_in_use', {
      description: 'Active database connections in pool',
    }));
  }

  static get probeSuccess(): UpDownCounter {
    return (_probeSuccess ??= getMeter().createUpDownCounter('probe_success', {
      description: 'Synthetic probe success state (1=ok, 0=failed)',
    }));
  }
}
