import { createServer } from 'node:http';

const PORT = 4101;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-sms' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'msg_stub', status: 'sent' }));
});

server.listen(PORT, () => {
  console.log(`fake-sms listening on :${PORT}`);
});
