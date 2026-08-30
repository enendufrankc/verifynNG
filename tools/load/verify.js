import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * E06 verify hot-path load test (T11).
 *
 * Mix: 70% tier-1 valid, 20% tier-2 valid, 10% invalid. 500 rps for 2 min.
 * Thresholds: p95 < 150ms, error rate < 0.1%.
 *
 * Seed TIER1_CODE and a batch of TIER2_CODES (comma-separated) for the
 * ivoryglow tenant first, then:
 *   docker compose --profile load run --rm \
 *     -e TIER1_CODE=ivoryglow.1.k1.XXXX...XXXX.XXXXXXXX \
 *     -e TIER2_CODES=ivoryglow.2.k1.AAAA....AAAAAAAA,ivoryglow.2.k1.BBBB....BBBBBBBB,... \
 *     k6 /scripts/verify.js
 *
 * This measures the hot path's own latency/throughput, not the rate
 * limiter (AC4/AC5 already cover that in isolation): tier-2 traffic is
 * spread across many codes (RATE_LIMIT_CODE_PER_MIN is per-code) and the
 * target tenant's `verifyRateLimitPerMin` should be raised for the run's
 * duration so tenant-level limiting doesn't dominate the results.
 * `expectedStatuses(200)` means any 429/503 correctly counts as a failure
 * here — if the codes/limits above aren't set up, that's the signal.
 */

export const options = {
  scenarios: {
    verify_hotpath: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<150'],
    http_req_failed: ['rate<0.001'],
    checks: ['rate>0.999'],
  },
};

const errorRate = new Rate('errors');
const verifyDuration = new Trend('verify_duration');

// eslint-disable-next-line no-undef
const API_URL = __ENV.API_URL || 'http://api:4000';
// eslint-disable-next-line no-undef
const TIER1_CODE = __ENV.TIER1_CODE;
// eslint-disable-next-line no-undef
const TIER2_CODES = (__ENV.TIER2_CODES || '').split(',').filter(Boolean);

if (!TIER1_CODE || TIER2_CODES.length === 0) {
  throw new Error(
    'TIER1_CODE and TIER2_CODES (comma-separated) env vars are required (seed units first, see docs/verification.md)',
  );
}

const INVALID_CODE = 'ivoryglow.2.k1.NOTAREALCODE.XXXXXXXX';

function randomIp() {
  return `10.${1 + Math.floor(Math.random() * 200)}.${Math.floor(
    Math.random() * 256,
  )}.${Math.floor(Math.random() * 256)}`;
}

export default function () {
  const roll = Math.random();
  const code =
    roll < 0.7
      ? TIER1_CODE
      : roll < 0.9
        ? TIER2_CODES[Math.floor(Math.random() * TIER2_CODES.length)]
        : INVALID_CODE;

  const res = http.get(`${API_URL}/v1/verify/${code}`, {
    headers: { 'User-Agent': 'k6-load-test', 'X-Forwarded-For': randomIp() },
    responseCallback: http.expectedStatuses(200),
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has correct content-type': (r) =>
      r.headers['Content-Type']?.includes('application/json') ?? false,
  });

  verifyDuration.add(res.timings.duration);
  errorRate.add(res.status >= 500);

  sleep(0.01);
}
