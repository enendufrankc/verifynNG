import { createServer } from 'node:http';

const PORT = 4103;

/**
 * Deterministic geo lookup table.
 * Keys are IP string prefixes; the first matching prefix wins.
 */
const GEO_TABLE = [
  { prefix: '10.1.', result: { country: 'NG', region: 'Lagos', city: 'Lagos', lat: 6.524, lon: 3.379 } },
  { prefix: '10.2.', result: { country: 'NG', region: 'Kano', city: 'Kano', lat: 12.0, lon: 8.517 } },
  { prefix: '10.3.', result: { country: 'GH', region: 'Greater Accra', city: 'Accra', lat: 5.556, lon: -0.187 } },
  { prefix: '10.4.', result: { country: 'KE', region: 'Nairobi', city: 'Nairobi', lat: -1.286, lon: 36.817 } },
  { prefix: '10.5.', result: { country: 'GB', region: 'England', city: 'London', lat: 51.507, lon: -0.128 } },
  { prefix: '127.', result: { country: null, region: null, city: 'Local network', lat: null, lon: null } },
  { prefix: '::1', result: { country: null, region: null, city: 'Local network', lat: null, lon: null } },
  { prefix: '192.168.', result: { country: null, region: null, city: 'Local network', lat: null, lon: null } },
];

const UNKNOWN_RESULT = { country: 'NG', region: null, city: 'Unknown region', lat: null, lon: null };

function lookup(ip) {
  if (!ip) return UNKNOWN_RESULT;
  for (const entry of GEO_TABLE) {
    if (ip.startsWith(entry.prefix)) {
      return entry.result;
    }
  }
  return UNKNOWN_RESULT;
}

const server = createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (parsedUrl.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'fake-geo' }));
    return;
  }

  if (parsedUrl.pathname === '/lookup' && req.method === 'GET') {
    const ip = parsedUrl.searchParams.get('ip');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lookup(ip)));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`fake-geo listening on :${PORT}`);
});
