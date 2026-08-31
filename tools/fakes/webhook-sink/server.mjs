import Fastify from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';

const app = Fastify({ logger: true });
// Every route here needs the exact raw body — signature verification is an
// HMAC over the raw bytes, so an object re-serialized by a JSON parser
// would never match. Override Fastify's built-in 'application/json' parser
// (a bare '*' wildcard does not override an already-registered type) and
// also catch everything else, so `curl -d '{"status":500}'` (no header, so
// curl defaults to form-urlencoded — see AC7's exact curl example) and a
// properly-typed `Content-Type: application/json` POST both land as the
// same raw string.
const passthrough = (req, body, done) => done(null, body);
app.addContentTypeParser('application/json', { parseAs: 'string' }, passthrough);
app.addContentTypeParser('*', { parseAs: 'string' }, passthrough);

const PORT = parseInt(process.env.PORT ?? '4105', 10);
const STALE_WINDOW_SEC = 5 * 60;
const MAX_DELIVERIES = 500;

let deliveries = [];
let idCounter = 1;
const behaviours = new Map(); // name -> { status: 200 | 500 | 'timeout' }

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Mirrors WebhookSigner (apps/api/src/modules/webhooks/webhook-signer.ts):
// v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>, 5-minute window.
function verifySignature(secret, timestamp, rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith('v1=')) {
    return { verified: false, reason: 'missing-signature' };
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!timestamp || Number.isNaN(skew) || skew > STALE_WINDOW_SEC) {
    return { verified: false, reason: 'stale' };
  }
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const given = signatureHeader.slice(3);
  const match =
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
  return match
    ? { verified: true, reason: 'ok' }
    : { verified: false, reason: 'mismatch' };
}

// ── Receive a delivery ─────────────────────────────────────

app.post('/hook/:name', async (req, reply) => {
  const { name } = req.params;
  const rawBody = req.body ?? '';
  const behaviour = behaviours.get(name) ?? { status: 200 };

  const timestamp = req.headers['x-verifyng-timestamp'];
  const signatureHeader = req.headers['x-verifyng-signature'];
  const secret = process.env[`SINK_SECRET_${name.toUpperCase()}`];

  const signatureResult = secret
    ? verifySignature(secret, timestamp, rawBody, signatureHeader)
    : { verified: null, reason: 'no-secret-configured' };

  deliveries.unshift({
    id: `del_${idCounter++}`,
    name,
    event: req.headers['x-verifyng-event'] ?? null,
    deliveryId: req.headers['x-verifyng-delivery'] ?? null,
    timestamp: timestamp ?? null,
    verified: signatureResult.verified,
    verifiedReason: signatureResult.reason,
    body: safeParseJson(rawBody),
    respondedStatus: behaviour.status === 'timeout' ? null : behaviour.status,
    receivedAt: new Date().toISOString(),
  });
  if (deliveries.length > MAX_DELIVERIES) {
    deliveries.length = MAX_DELIVERIES;
  }

  if (behaviour.status === 'timeout') {
    reply.hijack(); // never respond — client's own timeout fires
    return;
  }
  reply.code(behaviour.status);
  return { received: true };
});

// ── Behaviour injection ────────────────────────────────────

app.post('/api/behaviour/:name', async (req, reply) => {
  const { name } = req.params;
  const parsed = safeParseJson(req.body ?? '') ?? {};
  const status = parsed.status;
  if (status !== 200 && status !== 500 && status !== 'timeout') {
    reply.code(400);
    return { error: "status must be 200, 500, or 'timeout'" };
  }
  behaviours.set(name, { status });
  return { name, status };
});

// ── Query / clear deliveries ───────────────────────────────

app.get('/api/deliveries', async (req) => {
  const { name } = req.query;
  return name ? deliveries.filter((d) => d.name === name) : deliveries;
});

app.delete('/api/deliveries', async () => {
  deliveries = [];
  return { ok: true };
});

app.get('/health', async () => ({ status: 'ok', service: 'webhook-sink' }));

// ── Dashboard ───────────────────────────────────────────────

app.get('/', async () => {
  const rows = deliveries
    .map((d) => {
      const icon =
        d.verified === true ? '✓' : d.verified === false ? '✗' : '—';
      return `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.receivedAt}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.event ?? ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.deliveryId ?? ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee" title="${d.verifiedReason ?? ''}">${icon}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${d.respondedStatus ?? 'timeout'}</td>
    </tr>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html><head><title>Webhook Sink</title><meta http-equiv="refresh" content="3">
<style>body{font-family:system-ui,sans-serif;max-width:1000px;margin:24px auto;padding:0 16px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd}
code{background:#f5f5f5;padding:2px 6px;border-radius:4px}</style></head>
<body>
<h1>Webhook Sink</h1>
<p>POST a webhook to <code>/hook/:name</code>. Set <code>SINK_SECRET_&lt;NAME&gt;</code> (uppercased) to verify signatures.
Force a response with <code>POST /api/behaviour/:name {"status":500|"timeout"|200}</code>.</p>
<table>
<thead><tr><th>Received</th><th>Sink</th><th>Event</th><th>Delivery Id</th><th>Sig</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#999">No deliveries yet</td></tr>'}</tbody>
</table>
</body></html>`;
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
