// src/server.js — verification API + admin API + static pages
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verify } from './core/verify.js';
import { store } from './core/store.js';
import { ensureSecret } from './core/crypto.js';
import { mintBatch } from './core/mint.js';
import { generateExports, EXPORTS_DIR } from './core/sheet.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB_VERIFY = path.join(ROOT, '../web-verify');
const WEB_ADMIN = path.join(ROOT, '../web-admin');
const EXPORTS = EXPORTS_DIR;
const PORT = process.env.PORT || 8787;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
ensureSecret();

// ── admin auth (local: bearer token from password) ────────────────
const TOKEN = crypto.createHash('sha256').update(`admin|${ADMIN_PASSWORD}|${ensureSecret()}`).digest('hex');
function isAdmin(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

// ── in-memory sliding-window rate limiter ─────────────────────────
const hits = new Map();
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 20;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ip = req.socket.remoteAddress;
  const p = url.pathname;

  // ── public verification API ──────────────────────────────────────
  if (p.startsWith('/api/verify/')) {
    if (rateLimited(ip)) return send(res, 429, { verdict: 'rate-limited', reason: 'Too many verification attempts. Try again in a minute.' });
    const code = decodeURIComponent(p.slice('/api/verify/'.length));
    try { return send(res, 200, verify({ code, ip, userAgent: req.headers['user-agent'] })); }
    catch (e) { return send(res, 500, { verdict: 'error', reason: e.message }); }
  }
  if (p === '/api/health') return send(res, 200, { ok: true, tenants: store.listTenants().length, batches: store.listBatches().length });

  // ── admin API ────────────────────────────────────────────────────
  if (p === '/api/admin/login' && req.method === 'POST') {
    const { password } = await readBody(req);
    if (password === ADMIN_PASSWORD) return send(res, 200, { token: TOKEN });
    return send(res, 401, { error: 'wrong password' });
  }

  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });

    if (p === '/api/admin/overview' && req.method === 'GET') {
      const tenants = store.listTenants();
      const batches = store.listBatches();
      const units = store.listUnits();
      const recent = store.recentScans(200);
      return send(res, 200, {
        tenants: tenants.map(t => ({ id: t.id, name: t.name, products: t.products.length })),
        batches: batches.map(b => ({
          ...b,
          units: store.countUnits(b.id),
          scans: store.scansForBatch(b.id).length,
          tier2Scans: store.scansForBatch(b.id).filter(s => s.tier === 2).length,
        })),
        totals: { units: units.length, scans: recent.length, flagged: units.filter(u => u.state === 'flagged').length, decommissioned: units.filter(u => u.state === 'decommissioned').length },
        recentScans: recent.slice(0, 30),
      });
    }

    if (p === '/api/admin/mint' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const { tenantId = 'ivoryglow', productId, oem, count = 10, baseUrl = `http://localhost:${PORT}` } = body;
        const { batch, manifest } = mintBatch({ tenantId, productId, oem, count, baseUrl });
        const exp = await generateExports(manifest);
        return send(res, 200, { batch: { ...batch, units: store.countUnits(batch.id) }, exports: exp.files, dir: exp.dir, sample: manifest.units[0] });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (p.startsWith('/api/admin/batches/') && req.method === 'GET') {
      const id = decodeURIComponent(p.slice('/api/admin/batches/'.length).split('/')[0]);
      const batch = store.getBatch(id);
      if (!batch) return send(res, 404, { error: 'batch not found' });
      const units = store.listUnits(id).map(u => ({
        id: u.id, state: u.state || 'active',
        tier1Code: u.tier1Code,
        tier2Scans: store.scansForUnit(u.id, 2).length,
        tier1Scans: store.scansForUnit(u.id, 1).length,
      }));
      return send(res, 200, { batch, units, scans: store.scansForBatch(id).slice(-100).reverse() });
    }

    if (p.startsWith('/api/admin/units/') && req.method === 'POST') {
      const parts = p.split('/'); // ['', 'api', 'admin', 'units', '<id>', '<action>']
      const unitId = decodeURIComponent(parts[4]);
      const action = parts[5];
      const state = action === 'flag' ? 'flagged' : action === 'decommission' ? 'decommissioned' : action === 'restore' ? 'active' : null;
      if (!state) return send(res, 400, { error: 'action must be flag | decommission | restore' });
      const u = store.updateUnitState(unitId, state);
      if (!u) return send(res, 404, { error: 'unit not found' });
      return send(res, 200, { unit: { id: u.id, state: u.state } });
    }

    if (p.startsWith('/api/admin/exports/')) {
      const rel = decodeURIComponent(p.slice('/api/admin/exports/'.length));
      const fp = path.join(EXPORTS, rel);
      if (!fp.startsWith(EXPORTS) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'application/octet-stream');
    }

    return send(res, 404, { error: 'unknown admin route' });
  }

  // ── pages ────────────────────────────────────────────────────────
  if (p.startsWith('/v/')) {
    return send(res, 200, fs.readFileSync(path.join(WEB_VERIFY, 'index.html'), 'utf8'), 'text/html');
  }
  if (p === '/admin' || p.startsWith('/admin/')) {
    return send(res, 200, fs.readFileSync(path.join(WEB_ADMIN, 'index.html'), 'utf8'), 'text/html');
  }

  // ── static (web-verify + web-admin) ─────────────────────────────
  for (const base of [WEB_VERIFY, WEB_ADMIN]) {
    const file = p === '/' ? 'index.html' : p.slice(1);
    const fp = path.join(base, file);
    if (fp.startsWith(base) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'application/octet-stream');
    }
  }
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`\n  Verify Platform (local) → http://localhost:${PORT}`);
  console.log(`  Verify page:  http://localhost:${PORT}/v/<code>`);
  console.log(`  Admin console: http://localhost:${PORT}/admin  (password: ${ADMIN_PASSWORD === 'admin' ? 'admin (default — set ADMIN_PASSWORD env)' : '***'})\n`);
});
