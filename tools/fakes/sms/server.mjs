import Fastify from 'fastify';
import { createHmac } from 'node:crypto';

const app = Fastify({ logger: true });
await app.register((await import('@fastify/formbody')).default);
const PORT = parseInt(process.env.PORT ?? '4101', 10);
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// In-memory message store
let messages = [];
let idCounter = 1;

// ── SMS Send (Termii-shaped) ──────────────────────────────

app.post('/api/sms/send', async (req, reply) => {
  const { to, from, sms, api_key } = req.body ?? {};
  const id = `sms_${idCounter++}`;
  messages.push({
    id,
    channel: 'sms',
    to: to ?? '',
    from: from ?? 'VerifyN',
    body: sms ?? '',
    receivedAt: new Date().toISOString(),
  });
  return { message_id: id };
});

// ── WhatsApp Send ─────────────────────────────────────────

app.post('/api/whatsapp/send', async (req, reply) => {
  const { to, template, params } = req.body ?? {};
  const id = `wa_${idCounter++}`;
  messages.push({
    id,
    channel: 'whatsapp',
    to: to ?? '',
    from: 'VerifyN',
    body: template ?? '',
    params: params ?? {},
    receivedAt: new Date().toISOString(),
  });
  return { message_id: id };
});


// ── E06 compatibility: HttpFakeSms adapter posts {to, body} to /send; AC8 reads /outbox ──
app.post('/send', async (req, reply) => {
  const { to, body } = req.body ?? {};
  if (typeof to !== 'string' || typeof body !== 'string') {
    reply.code(400);
    return { error: 'to and body are required' };
  }
  const id = `msg_${idCounter++}`;
  messages.push({ id, channel: 'sms', to, from: 'VerifyN', body, receivedAt: new Date().toISOString() });
  return { id, status: 'sent' };
});

app.get('/outbox', async () =>
  messages.filter((m) => m.channel === 'sms').map((m) => ({ id: m.id, to: m.to, body: m.body, sentAt: m.receivedAt })),
);

// ── List Messages ─────────────────────────────────────────

app.get('/api/messages', async (req) => {
  const { channel, to } = req.query;
  let filtered = messages;
  if (channel) filtered = filtered.filter((m) => m.channel === channel);
  if (to) filtered = filtered.filter((m) => m.to === to);
  return filtered;
});

// ── Clear Messages ────────────────────────────────────────

app.delete('/api/messages', async () => {
  messages = [];
  return { ok: true };
});

// ── Inbound SMS simulation ────────────────────────────────

app.post('/api/inbound', async (req, reply) => {
  const { from, text } = req.body ?? {};
  const payload = {
    from: from ?? '+2348000000001',
    text: text ?? '',
    receivedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${API_URL}/v1/verify/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.text();
    return { forwarded: true, status: res.status, response: data };
  } catch (err) {
    return { forwarded: false, error: err.message };
  }
});

// ── Bounce simulation ─────────────────────────────────────

app.post('/api/bounce', async (req, reply) => {
  const { recipient, type } = req.body ?? {};
  const payload = {
    type: type ?? 'bounce',
    recipient: recipient ?? 'owner@ivoryglow.test',
  };
  const rawBody = JSON.stringify(payload);

  const secret = process.env.FAKE_WEBHOOK_SECRET ?? 'dev-secret';
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    const res = await fetch(`${API_URL}/v1/webhooks/fake-mail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fake-Signature': signature,
      },
      body: rawBody,
    });
    const data = await res.text();
    return { forwarded: true, status: res.status, response: data };
  } catch (err) {
    return { forwarded: false, error: err.message };
  }
});

// ── Health ────────────────────────────────────────────────

app.get('/health', async () => {
  return { status: 'ok', service: 'fake-sms' };
});

// ── UI ────────────────────────────────────────────────────

app.get('/', async () => {
  const msgRows = messages
    .map(
      (m) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${m.channel}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${m.to}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;max-width:300px;word-break:break-all">${m.body}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${m.receivedAt}</td>
    </tr>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html><head><title>Fake SMS / WhatsApp</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd}
input,textarea,select{padding:8px;width:100%;box-sizing:border-box;margin:4px 0}
button{padding:10px 20px;background:#1a1a2e;color:#fff;border:none;border-radius:4px;cursor:pointer;margin:4px}
button:hover{background:#2a2a4e}
.section{margin:24px 0;padding:16px;background:#fafafa;border-radius:8px;border:1px solid #eee}
h2{margin-top:0}</style></head>
<body>
<h1>Fake SMS / WhatsApp</h1>

<div class="section">
<h2>Messages</h2>
<table>
<thead><tr><th>Channel</th><th>To</th><th>Body</th><th>Time</th></tr></thead>
<tbody>${msgRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#999">No messages yet</td></tr>'}</tbody>
</table>
<form method="POST" action="/api/messages" style="display:inline">
<button type="submit" formaction="/api/messages" formmethod="DELETE" style="background:#c00;margin-top:8px">Clear all</button>
</form>
</div>

<div class="section">
<h2>Simulate Inbound SMS</h2>
<form method="POST" action="/api/inbound">
<label>From number</label>
<input name="from" value="+2348000000001" />
<label>Text</label>
<input name="text" placeholder="e.g. ivoryglow.2.k1..." />
<button type="submit">Send inbound</button>
</form>
</div>

<div class="section">
<h2>Simulate Bounce / Complaint</h2>
<form method="POST" action="/api/bounce">
<label>Recipient email</label>
<input name="recipient" value="owner@ivoryglow.test" />
<label>Type</label>
<select name="type">
<option value="bounce">Bounce</option>
<option value="complaint">Complaint</option>
</select>
<button type="submit" style="background:#c00">Simulate bounce</button>
</form>
</div>
</body></html>`;
});

// Start
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
