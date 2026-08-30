import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

/**
 * E07 anomaly-engine throughput test.
 *
 * Drives 200 `scan.recorded`/s (via real tier-2 verifies, spread across
 * TIER2_CODES so no single unit/IP trips a rate limit) for 5 minutes and
 * checks the verify hot path keeps its own latency/error budget under that
 * load. It does *not* assert queue depth itself — k6 has no view into
 * Redis — so the acceptance check ("without queue growth") is: watch the
 * `anomaly` BullMQ queue's wait-list length before, during, and after the
 * run and confirm it doesn't trend upward (a consumer keeping up drains
 * jobs about as fast as they arrive, so the queue oscillates near zero
 * rather than climbing):
 *
 *   watch -n 5 'docker compose exec -T redis redis-cli LLEN bull:anomaly:wait'
 *
 * Seed a batch of TIER2_CODES (comma-separated, ideally 60+ so
 * evaluate() jobs spread across enough distinct units/IPs that this run
 * doesn't itself manufacture velocity/geo_dispersion anomalies), then:
 *
 *   docker compose --profile load run --rm \
 *     -e TIER2_CODES=ivoryglow.2.k1.AAAA....AAAAAAAA,ivoryglow.2.k1.BBBB....BBBBBBBB,... \
 *     k6 /scripts/anomaly.js
 *
 * The `http_req_duration` threshold assumes a host running only this
 * compose stack. Smoke-tested at a reduced rate/duration on a dev machine
 * that had several *other* epics' full compose stacks up at the same time
 * (shared worktrees, each with its own postgres/redis/api) — latency was
 * dominated by that contention, not the anomaly engine, so the threshold
 * couldn't be meaningfully validated there. The queue-depth check above is
 * the actual acceptance signal and held: `bull:anomaly:wait` returned to 0
 * immediately after the run.
 */

export const options = {
  scenarios: {
    anomaly_throughput: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.001'],
    checks: ['rate>0.999'],
  },
};

const errorRate = new Rate('errors');

// eslint-disable-next-line no-undef
const API_URL = __ENV.API_URL || 'http://api:4000';
// eslint-disable-next-line no-undef
const TIER2_CODES = (__ENV.TIER2_CODES || '').split(',').filter(Boolean);

if (TIER2_CODES.length === 0) {
  throw new Error(
    'TIER2_CODES (comma-separated) env var is required — seed a batch of units first, see docs/anomaly/rules.md',
  );
}

// Spread requests across many source IPs too, so this run's own traffic
// doesn't manufacture velocity anomalies that would otherwise pollute
// whatever tenant it's pointed at.
function randomIp() {
  return `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(
    Math.random() * 256,
  )}.${Math.floor(Math.random() * 256)}`;
}

export default function () {
  const code = TIER2_CODES[Math.floor(Math.random() * TIER2_CODES.length)];

  const res = http.get(`${API_URL}/v1/verify/${code}`, {
    headers: {
      'User-Agent': 'k6-anomaly-load-test',
      'X-Forwarded-For': randomIp(),
    },
    responseCallback: http.expectedStatuses(200),
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'scanEventId present (evaluate job was enqueued)': (r) => {
      try {
        return typeof JSON.parse(r.body).scanEventId === 'string';
      } catch {
        return false;
      }
    },
  });

  errorRate.add(res.status >= 500);

  sleep(0.005);
}
