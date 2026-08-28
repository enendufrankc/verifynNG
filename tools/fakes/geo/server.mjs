import { createServer } from 'node:http';

const PORT = 4103;

const server = createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-geo' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ country: 'NG', city: 'Lagos' }));
});

server.listen(PORT, () => {
  console.log(`fake-geo listening on :${PORT}`);
});
