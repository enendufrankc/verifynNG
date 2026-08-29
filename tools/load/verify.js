import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const options = {
  scenarios: {
    verify_hotpath: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
    checks: ['rate>0.999'],
  },
};

const errorRate = new Rate('errors');
const verifyDuration = new Trend('verify_duration');

// eslint-disable-next-line no-undef
const API_URL = __ENV.API_URL || 'http://api:4000';

// TODO(E06): Replace with real tier-1 codes from seed manifest
const CODES = Array.from(
  { length: 20 },
  (_, i) => `VK1LOAD${String(i).padStart(8, '0')}`,
);

export default function () {
  const code = CODES[Math.floor(Math.random() * CODES.length)];
  const res = http.get(`${API_URL}/v1/verify/${code}`, {
    headers: { 'User-Agent': 'k6-load-test' },
  });

  check(res, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'has correct content-type': (r) =>
      r.headers['Content-Type']?.includes('application/json') ?? false,
  });

  verifyDuration.add(res.timings.duration);
  errorRate.add(res.status >= 500);

  sleep(0.01);
}
