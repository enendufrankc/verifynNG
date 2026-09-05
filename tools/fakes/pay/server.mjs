import Fastify from 'fastify';
import { createHmac } from 'node:crypto';

const app = Fastify({ logger: true });
await app.register((await import('@fastify/formbody')).default);

const PORT = 4102;
const SECRET = process.env.FAKE_PAY_SECRET ?? 'fake_sk_test';
const WEBHOOK_URL =
  process.env.FAKE_PAY_WEBHOOK_URL ?? 'http://api:4000/v1/billing/webhooks/paystack';
// Browser-reachable URL for the hosted checkout page — the api container
// reaches this service at http://fake-pay:4102, but a browser redirected
// here needs the host-mapped port (per-worktree offset, see AGENTS.md).
const PUBLIC_URL = process.env.FAKE_PAY_PUBLIC_URL ?? `http://localhost:${PORT}`;

let idCounter = 1;
/** reference -> { id, reference, amount, currency, email, status, authorizationCode, cardLast4 } */
const transactions = new Map();

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function sign(bodyStr) {
  return createHmac('sha512', SECRET).update(bodyStr).digest('hex');
}

/**
 * Mirrors what a real Paystack hosted checkout does: the browser redirects
 * back to the merchant immediately, and — independently, async — a
 * charge.success/charge.failed webhook fires. PaymentGatewayPort's
 * chargeAuthorisation (used for recurring/dunning charges, not checkout)
 * is fully synchronous and deliberately does NOT also fire a webhook here.
 */
async function fireWebhook(eventType, txn) {
  const payload = {
    event: eventType,
    data: {
      id: txn.id,
      reference: txn.reference,
      status: eventType === 'charge.success' ? 'success' : 'failed',
      amount: txn.amount,
      currency: txn.currency,
      gateway_response: eventType === 'charge.success' ? 'Approved' : 'Declined',
      authorization: txn.authorizationCode
        ? {
            authorization_code: txn.authorizationCode,
            last4: txn.cardLast4,
            card_type: 'visa',
            reusable: true,
          }
        : undefined,
    },
  };
  const body = JSON.stringify(payload);
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sign(body) },
      body,
    });
  } catch (err) {
    app.log.error({ err }, 'fake-pay: failed to deliver webhook');
  }
}

// ── Paystack-shaped API ──────────────────────────────────────

app.post('/transaction/initialize', async (req, reply) => {
  const { reference, amount, currency, email, callback_url, metadata } = req.body ?? {};
  if (!reference || !amount) {
    reply.code(400);
    return { status: false, message: 'reference and amount are required' };
  }
  const txn = {
    id: idCounter++,
    reference,
    amount,
    currency: currency ?? 'NGN',
    email,
    callbackUrl: callback_url,
    metadata,
    status: 'pending',
    authorizationCode: null,
    cardLast4: null,
  };
  transactions.set(reference, txn);
  return {
    status: true,
    message: 'Authorization URL created',
    data: {
      authorization_url: `${PUBLIC_URL}/checkout/${reference}`,
      access_code: `access_${txn.id}`,
      reference,
    },
  };
});

app.get('/transaction/verify/:reference', async (req, reply) => {
  const txn = transactions.get(req.params.reference);
  if (!txn) {
    reply.code(404);
    return { status: false, message: 'transaction not found' };
  }
  return {
    status: true,
    data: {
      reference: txn.reference,
      status:
        txn.status === 'success' ? 'success' : txn.status === 'failed' ? 'failed' : 'pending',
      amount: txn.amount,
      currency: txn.currency,
      authorization: txn.authorizationCode
        ? { authorization_code: txn.authorizationCode, last4: txn.cardLast4, card_type: 'visa' }
        : undefined,
    },
  };
});

app.post('/transaction/charge_authorization', async (req, reply) => {
  const { authorization_code, email, amount, currency, reference } = req.body ?? {};
  const failed = typeof authorization_code === 'string' && authorization_code.endsWith('-FAIL');
  const txn = {
    id: idCounter++,
    reference,
    amount,
    currency: currency ?? 'NGN',
    email,
    status: failed ? 'failed' : 'success',
    authorizationCode: authorization_code,
    cardLast4: null,
  };
  transactions.set(reference, txn);
  return {
    status: true,
    data: {
      reference,
      status: failed ? 'failed' : 'success',
      gateway_response: failed ? 'Declined' : 'Approved',
    },
  };
});

// ── Hosted checkout (browser-facing) ─────────────────────────

app.get('/checkout/:ref', async (req, reply) => {
  const txn = transactions.get(req.params.ref);
  if (!txn) {
    reply.code(404);
    return 'Transaction not found';
  }
  reply.type('text/html');
  const result = req.query.result;
  return `<!DOCTYPE html>
<html><head><title>fake-pay checkout</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:48px auto;padding:0 16px}
.card{border:1px solid #ddd;border-radius:8px;padding:24px}
h1{font-size:18px;margin:0 0 4px}
.amount{font-size:28px;font-weight:700;margin:8px 0 20px}
label{display:block;font-size:13px;color:#555;margin-bottom:4px}
input{padding:10px;width:100%;box-sizing:border-box;margin-bottom:16px;border:1px solid #ccc;border-radius:4px}
button{padding:12px 20px;border:none;border-radius:4px;cursor:pointer;font-size:14px;width:100%;margin-bottom:8px}
.pay{background:#0a8f4f;color:#fff}
.fail{background:#c00;color:#fff}
.banner{padding:12px;border-radius:4px;margin-bottom:16px;font-size:14px}
.banner.success{background:#e6f7ee;color:#0a8f4f}
.banner.failed{background:#fdecec;color:#c00}
</style></head>
<body>
<div class="card">
<h1>${esc(txn.metadata?.tenantId ?? 'VerifyN')}</h1>
<div class="amount">${(txn.amount / 100).toLocaleString()} ${esc(txn.currency)}</div>
${result === 'success' ? '<div class="banner success">Payment successful.</div>' : ''}
${result === 'failed' ? '<div class="banner failed">Payment failed.</div>' : ''}
<form method="POST" action="/checkout/${esc(txn.reference)}/pay">
<label>Card number (last 4 digits)</label>
<input name="last4" value="4081" maxlength="4" pattern="[0-9]{4}" />
<button class="pay" type="submit">Pay</button>
</form>
<form method="POST" action="/checkout/${esc(txn.reference)}/fail">
<button class="fail" type="submit">Fail</button>
</form>
<p style="font-size:12px;color:#999">Reference: ${esc(txn.reference)}</p>
</div>
</body></html>`;
});

app.post('/checkout/:ref/pay', async (req, reply) => {
  const txn = transactions.get(req.params.ref);
  if (!txn) {
    reply.code(404);
    return { error: 'not_found' };
  }
  const last4 = String(req.body?.last4 ?? '4081').slice(-4);
  txn.status = 'success';
  txn.authorizationCode = `AUTH_${txn.id}`;
  txn.cardLast4 = last4;
  await fireWebhook('charge.success', txn);
  reply.redirect(`/checkout/${encodeURIComponent(txn.reference)}?result=success`);
});

app.post('/checkout/:ref/fail', async (req, reply) => {
  const txn = transactions.get(req.params.ref);
  if (!txn) {
    reply.code(404);
    return { error: 'not_found' };
  }
  txn.status = 'failed';
  await fireWebhook('charge.failed', txn);
  reply.redirect(`/checkout/${encodeURIComponent(txn.reference)}?result=failed`);
});

// ── Admin / health ────────────────────────────────────────────

app.get('/admin', async (req, reply) => {
  reply.type('text/html');
  const rows = [...transactions.values()]
    .reverse()
    .map(
      (t) => `<tr>
<td style="padding:8px;border-bottom:1px solid #eee">${t.id}</td>
<td style="padding:8px;border-bottom:1px solid #eee">${esc(t.reference)}</td>
<td style="padding:8px;border-bottom:1px solid #eee">${(t.amount / 100).toLocaleString()} ${esc(t.currency)}</td>
<td style="padding:8px;border-bottom:1px solid #eee">${esc(t.status)}</td>
<td style="padding:8px;border-bottom:1px solid #eee">${esc(t.authorizationCode)}</td>
</tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html><head><title>fake-pay admin</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px;background:#f5f5f5;border-bottom:2px solid #ddd}</style>
</head><body>
<h1>fake-pay — transactions</h1>
<table>
<thead><tr><th>ID</th><th>Reference</th><th>Amount</th><th>Status</th><th>Authorization</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#999">No transactions yet</td></tr>'}</tbody>
</table>
</body></html>`;
});

app.get('/health', async () => ({ status: 'ok', service: 'fake-pay' }));

// Only listen when run directly (`node server.mjs`) — importing `app` from
// contract.test.mjs uses Fastify's `.inject()` instead, so tests don't need
// a real network listener or a free port.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export { app };
