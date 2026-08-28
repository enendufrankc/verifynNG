#!/usr/bin/env node
// cli.js — tenant setup, batch minting, QR sheet export, inspection
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { mintBatch } from './src/core/mint.js';
import { store } from './src/core/store.js';
import { ensureSecret } from './src/core/crypto.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS = path.join(ROOT, 'exports');
ensureSecret();

const args = process.argv.slice(2);
const cmd = args[0];

function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const DEFAULT_TENANT = {
  id: 'ivoryglow',
  name: 'IVORY GLOW',
  legalName: 'Tunnel Light Global Concept Ltd',
  trademark: 'NG/TM/O/2020/11950',
  products: [
    { id: 'ig004', name: 'IVORY GLOW Turmeric & Curcumin Shower Gel 1000ml' },
    { id: 'ig005', name: 'IVORY GLOW Retinol & Amino Acids Shower Gel 1000ml' },
    { id: 'ig006', name: 'IVORY GLOW Vitamin C & B3 Shower Gel + Collagen Peptide 24 1000ml' },
  ],
};

async function main() {
  if (cmd === 'setup') {
    const t = store.getTenant(DEFAULT_TENANT.id) || DEFAULT_TENANT;
    store.upsertTenant(t);
    console.log(`Tenant ready: ${t.name} (${t.products.length} products)`);
    return;
  }

  if (cmd === 'mint') {
    const tenantId = arg('tenant', 'ivoryglow');
    const productId = arg('product', 'ig004');
    const count = parseInt(arg('count', '10'), 10);
    const oem = arg('oem', 'Guiba OEM (China)');
    const baseUrl = arg('url', 'http://localhost:8787');
    if (!store.getTenant(tenantId)) { console.error('Run `node cli.js setup` first.'); process.exit(1); }

    const { batch, manifest } = mintBatch({ tenantId, productId, oem, count, baseUrl });
    console.log(`\nMinted batch ${batch.id}`);
    console.log(`  product : ${productId}  ×  ${count} units`);
    console.log(`  OEM     : ${oem}`);

    // ── QR sheet: printable HTML + per-unit PNGs + signed manifest ────
    const dir = path.join(EXPORTS, batch.id);
    fs.mkdirSync(path.join(dir, 'qr'), { recursive: true });
    const cards = [];
    for (const u of manifest.units) {
      const [qr1Png, qr2Png] = await Promise.all([
        QRCode.toBuffer(`${baseUrl}/v/${u.tier1Code}`, { width: 300, margin: 1 }),
        QRCode.toBuffer(`${baseUrl}/v/${u.tier2Code}`, { width: 300, margin: 1 }),
      ]);
      fs.writeFileSync(path.join(dir, 'qr', `${u.unitId}-tier1.png`), qr1Png);
      fs.writeFileSync(path.join(dir, 'qr', `${u.unitId}-tier2.png`), qr2Png);
      cards.push(`
        <div class="card">
          <div class="unit">${u.unitId}</div>
          <div class="col">
            <img src="data:image/png;base64,${qr1Png.toString('base64')}">
            <b>TIER 1 · PUBLIC</b><span>print on bottle</span>
          </div>
          <div class="col scratch">
            <img src="data:image/png;base64,${qr2Png.toString('base64')}">
            <b>TIER 2 · HIDDEN</b><span>scratch-off label</span>
          </div>
        </div>`);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR Sheet ${batch.id}</title>
<style>
body{font-family:system-ui;padding:24px;background:#f5f1e8;color:#231C10}
h1{font-size:18px}h2{font-size:13px;font-weight:500;color:#9A6A18}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.card{background:#fff;border:1px solid #E3A93C;border-radius:6px;padding:12px;display:flex;gap:12px;align-items:center;page-break-inside:avoid}
.unit{font-size:11px;font-weight:700;writing-mode:vertical-rl;transform:rotate(180deg);color:#9A6A18}
.col{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:8px;letter-spacing:.12em;text-transform:uppercase}
.col b{font-size:9px}.col span{color:#5C5140}
.col img{width:120px;height:120px}
.scratch{border-left:2px dashed #E3A93C;padding-left:12px}
@media print{body{background:#fff}}
</style></head><body>
<h1>IVORY GLOW — QR Application Sheet</h1>
<h2>Batch ${batch.id} · ${manifest.product.name} · ${manifest.count} units · OEM: ${manifest.oem}</h2>
<div class="grid">${cards.join('')}</div>
</body></html>`;
    fs.writeFileSync(path.join(dir, 'qr-sheet.html'), html);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const example = manifest.units[0];
    console.log(`\nExports → ${dir}`);
    console.log(`  qr-sheet.html   (print-ready, both tiers per unit)`);
    console.log(`  manifest.json   (signed — deliver to OEM only)`);
    console.log(`  qr/*.png        (${manifest.units.length * 2} files)`);
    console.log(`\nTry it:`);
    console.log(`  Tier 1 (public):  ${baseUrl}/v/${example.tier1Code}`);
    console.log(`  Tier 2 (hidden):  ${baseUrl}/v/${example.tier2Code}`);
    return;
  }

  if (cmd === 'list') {
    const batches = store.listBatches();
    if (!batches.length) return console.log('No batches. Run `node cli.js mint --count 5`.');
    for (const b of batches) {
      const scans = store.scansForBatch(b.id).length;
      console.log(`${b.id}  ${b.product}  ×${b.count}  OEM:${b.oem || '-'}  scans:${scans}`);
    }
    return;
  }

  if (cmd === 'show') {
    const id = arg('batch', args[1]);
    const b = store.getBatch(id);
    if (!b) return console.log('batch not found');
    console.log(JSON.stringify(b, null, 2));
    console.log(`units: ${store.countUnits(b.id)}, scans: ${store.scansForBatch(b.id).length}`);
    return;
  }

  console.log(`Usage:
  node cli.js setup                                    register IVORY GLOW tenant
  node cli.js mint [--product ig004] [--count 10]      mint batch + export QR sheet & signed manifest
            [--oem "Name"] [--url http://localhost:8787]
  node cli.js list                                     list batches
  node cli.js show <batchId>                           batch details
  npm start                                            run verification server (port 8787)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
