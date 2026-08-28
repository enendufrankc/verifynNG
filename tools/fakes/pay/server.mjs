import { createServer } from 'node:http';

const PORT = 4102;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-pay' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: 'pay_stub', status: 'success' }));
});

server.listen(PORT, () => {
  console.log(`fake-pay listening on :${PORT}`);
});
