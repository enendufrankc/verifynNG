import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = 4101;

/**
 * fake-sms — E00's stub, minimally extended by E06 with a real in-memory
 * outbox so `HttpFakeSms.send()` (POST /send) and E06's AC8 verification
 * (GET /outbox) actually round-trip. E14 owns this service long-term and
 * will replace it with the Termii adapter's local double.
 */
const outbox = [];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-sms' }));
    return;
  }

  if (req.url === '/send' && req.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid JSON body' }));
      return;
    }
    const message = {
      id: `msg_${randomUUID()}`,
      to: payload.to ?? null,
      body: payload.body ?? null,
      sentAt: new Date().toISOString(),
    };
    outbox.push(message);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: message.id, status: 'sent' }));
    return;
  }

  if (req.url === '/outbox' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(outbox));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`fake-sms listening on :${PORT}`);
});
