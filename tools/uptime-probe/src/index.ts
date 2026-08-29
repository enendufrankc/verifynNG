import { createServer } from 'http';
import { Registry, Gauge } from 'prom-client';

const register = new Registry();

const probeSuccessGauge = new Gauge({
  name: 'probe_success',
  help: 'State of synthetic probe (1=success, 0=failure)',
  labelNames: ['target'],
  registers: [register],
});

const probeLatencyGauge = new Gauge({
  name: 'probe_latency_ms',
  help: 'Latency of synthetic probe in ms',
  labelNames: ['target'],
  registers: [register],
});

const API_URL = process.env.API_URL || 'http://api:4000';
const WEB_VERIFY_URL = process.env.WEB_VERIFY_URL || 'http://web-verify:3000';
const WEB_ADMIN_URL = process.env.WEB_ADMIN_URL || 'http://web-admin:3001';
const PROBE_KEY = process.env.PROBE_KEY || 'probe-secret-local';
const PROBE_FIXTURE_CODE = process.env.PROBE_FIXTURE_CODE || 'PROBE_TIER1_OK';
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS) || 30_000;
const METRICS_PORT = Number(process.env.UPTIME_PROBE_PORT) || 9465;

async function checkTarget(
  targetName: string,
  url: string,
  headers: Record<string, string> = {},
) {
  const start = performance.now();
  let ok = false;
  let statusCode = 0;
  let verdict: string | undefined = undefined;

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    statusCode = res.status;
    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      ok = true;
      try {
        const body = await res.json();
        if (body.verdict) verdict = body.verdict;
      } catch {
        // non-JSON ok response
      }
    }

    probeSuccessGauge.set({ target: targetName }, ok ? 1 : 0);
    probeLatencyGauge.set({ target: targetName }, latencyMs);

    // Report probe result to API
    try {
      await fetch(`${API_URL}/v1/status/probe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-synthetic-probe': PROBE_KEY,
        },
        body: JSON.stringify({
          target: targetName,
          ok,
          statusCode,
          latencyMs,
          verdict,
          at: new Date().toISOString(),
        }),
      });
    } catch (reportErr) {
      console.error('Failed to report probe result to API', reportErr);
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    probeSuccessGauge.set({ target: targetName }, 0);
    probeLatencyGauge.set({ target: targetName }, latencyMs);
    console.error(`Probe target ${targetName} failed:`, err);
  }
}

async function runProbes() {
  await checkTarget(
    'verify-api',
    `${API_URL}/v1/verify/${PROBE_FIXTURE_CODE}`,
    {
      'x-synthetic-probe': PROBE_KEY,
    },
  );
  await checkTarget('web-verify', `${WEB_VERIFY_URL}/`);
  await checkTarget('web-admin', `${WEB_ADMIN_URL}/api/ready`);
}

// Start HTTP server for /metrics and /health
const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
  } else if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': register.contentType });
    res.end(await register.metrics());
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(METRICS_PORT, () => {
  console.log(`Uptime probe metrics listening on port ${METRICS_PORT}`);
  runProbes();
  setInterval(runProbes, INTERVAL_MS);
});
