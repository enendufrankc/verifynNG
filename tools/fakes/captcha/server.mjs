import Fastify from 'fastify';

const app = Fastify({ logger: true });
await app.register((await import('@fastify/formbody')).default);
const PORT = parseInt(process.env.PORT ?? '4106', 10);

let verifications = [];
let idCounter = 1;

app.post('/siteverify', async (req, reply) => {
  const body = req.body ?? {};
  const token = body.response ?? body.token ?? '';
  const record = { id: idCounter++, token, receivedAt: new Date().toISOString() };

  if (typeof token === 'string' && token.startsWith('ok-')) {
    verifications.push({ ...record, success: true });
    return { success: true, challenge_ts: record.receivedAt, hostname: 'localhost' };
  }
  if (typeof token === 'string' && token.startsWith('fail-')) {
    verifications.push({ ...record, success: false });
    return { success: false, 'error-codes': ['invalid-input-response'] };
  }
  await new Promise((r) => setTimeout(r, 200));
  verifications.push({ ...record, success: true });
  return { success: true, challenge_ts: record.receivedAt, hostname: 'localhost' };
});

app.get('/verifications', async () => verifications);
app.delete('/verifications', async () => {
  verifications = [];
  return { ok: true };
});

app.get('/health', async () => ({ status: 'ok', service: 'fake-captcha' }));

app.get('/', async () => `
<!DOCTYPE html>
<html><head><title>Fake Captcha (Turnstile)</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:24px auto;padding:0 16px}
code{background:#f5f5f5;padding:2px 6px;border-radius:4px}</style></head>
<body>
<h1>Fake Turnstile Captcha</h1>
<p>POST a token via <code>captchaToken</code> to any E08 public route. This service backs <code>POST /siteverify</code>.</p>
<ul>
<li>Token starting with <code>ok-</code> → success</li>
<li>Token starting with <code>fail-</code> → <code>invalid-input-response</code></li>
<li>Any other token → success after a 200ms delay</li>
</ul>
<p><a href="/verifications">Recent verifications (JSON)</a></p>
</body></html>`);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
