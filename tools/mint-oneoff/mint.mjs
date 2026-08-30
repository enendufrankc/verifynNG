#!/usr/bin/env node
// One-off production mint. Generates tier-1 + tier-2 codes with @verifynng/core, then writes:
//   manifest.json  (SECRET — raw tier-2 codes; deliver to label printer only)
//   import.json    (tier-2 as hashes only; load into the platform's Unit table later)
//   codes.csv      (unitId, product, tier1Url, tier2Url)
//   <sku>-labels.pdf (print sheets: tier-1 QR + tier-2 scratch QR + product, EAN-13, NAFDAC, unit id)
//   key.txt        (the signing key — back it up; it becomes the platform's k1)
// Usage: node mint.mjs --config ivoryglow.json --out <dir> [--key <hex64>] [--count 10000]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import {
  StaticKeyRing, generateCode, hashForStorage, redactCode, signManifest, deriveBatchWatermark,
} from '@verifynng/core';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const cfg = JSON.parse(fs.readFileSync(arg('config', 'ivoryglow.json'), 'utf8'));
const out = path.resolve(arg('out', `out/${cfg.tenant}-${new Date().toISOString().slice(0, 10)}`));
const total = parseInt(arg('count', String(cfg.count ?? 10000)), 10);
const fromManifest = arg('manifest');
const keyHex = arg('key') || process.env.CORE_KEY_HEX
  || (fromManifest && fs.readFileSync(path.join(path.dirname(fromManifest), 'key.txt'), 'utf8').match(/CORE_KEYS=k\d+:([0-9a-f]{64})/)?.[1])
  || crypto.randomBytes(32).toString('hex');
const kid = cfg.kid ?? 'k1';
const ring = new StaticKeyRing(`${kid}:${keyHex}`, kid);
const base = cfg.baseUrl.replace(/\/$/, '');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'key.txt'), `CORE_KEYS=${kid}:${keyHex}\nCORE_ACTIVE_KID=${kid}\n# Back this up. Losing it makes every printed code unverifiable.\n`, { mode: 0o600 });

// ── split units across products as evenly as possible ───────────────────────────
const per = Math.floor(total / cfg.products.length);
const rem = total % cfg.products.length;
const batchId = fromManifest ? JSON.parse(fs.readFileSync(fromManifest, 'utf8')).batch
  : `${cfg.tenant.toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${cfg.batchSuffix ?? 'A'}`;
const watermark = deriveBatchWatermark(ring, { tenant: cfg.tenant, batchId });

let units = [];
let serial = 0;
if (fromManifest) {
  const prev = JSON.parse(fs.readFileSync(fromManifest, 'utf8'));
  units = prev.units.map(u => ({ ...u, tier2Hash: hashForStorage(u.tier2Code) }));
  console.log(`re-rendering ${units.length} existing units from ${fromManifest} (codes unchanged)`);
}
for (const [pi, p] of cfg.products.entries()) {
  if (fromManifest) break;
  const n = per + (pi < rem ? 1 : 0);
  for (let i = 0; i < n; i++) {
    serial += 1;
    const t1 = generateCode(ring, { tenant: cfg.tenant, tier: 1 }).code;
    const t2 = generateCode(ring, { tenant: cfg.tenant, tier: 2 }).code;
    units.push({
      unitId: `${batchId}-${String(serial).padStart(6, '0')}`,
      productId: p.id, tier1Code: t1, tier2Code: t2, tier2Hash: hashForStorage(t2),
    });
  }
}
console.log(`minted ${units.length} units across ${cfg.products.length} products (batch ${batchId}, kid ${kid}, watermark ${watermark})`);

// ── manifest (secret) + import (hashes only) + csv ──────────────────────────────
const manifestBody = {
  version: 1, batch: batchId, tenant: cfg.tenant, kid, watermark, baseUrl: base,
  products: cfg.products.map(({ id, name, gtin, nafdac }) => ({ id, name, gtin, nafdac })),
  count: units.length, createdAt: new Date().toISOString(),
  units: units.map(u => ({ unitId: u.unitId, productId: u.productId, tier1Code: u.tier1Code, tier2Code: u.tier2Code })),
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(signManifest(ring, manifestBody), null, 1), { mode: 0o600 });
fs.writeFileSync(path.join(out, 'import.json'), JSON.stringify({
  batch: batchId, tenant: cfg.tenant, kid, watermark, baseUrl: base, createdAt: manifestBody.createdAt,
  products: cfg.products.map(p => p.id),
  units: units.map(u => ({ unitId: u.unitId, productId: u.productId, tier1Code: u.tier1Code, tier2Hash: u.tier2Hash })),
}, null, 1));
fs.writeFileSync(path.join(out, 'codes.csv'), ['unitId,productId,tier1Url,tier2Url',
  ...units.map(u => `${u.unitId},${u.productId},${base}/v/${u.tier1Code},${base}/v/${u.tier2Code}`)].join('\n') + '\n', { mode: 0o600 });

// ── PDF label sheets, one file per product ──────────────────────────────────────
const mm = 72 / 25.4;
const L = cfg.layout ?? { pageW: 210, pageH: 297, margin: 8, cols: 3, rows: 4 };
const cellW = (L.pageW - 2 * L.margin) / L.cols, cellH = (L.pageH - 2 * L.margin) / L.rows;

const barcodeCache = new Map();
async function barcodePng(gtin) {
  if (!barcodeCache.has(gtin)) {
    const buf = await bwipjs.toBuffer({ bcid: 'ean13', text: gtin, scale: 3, height: 10, includetext: true, textxalign: 'center' });
    barcodeCache.set(gtin, buf);
  }
  return barcodeCache.get(gtin);
}
const qr = (text) => QRCode.toBuffer(text, { errorCorrectionLevel: 'M', margin: 1, width: 360 });

function instructionPage(doc, p, n) {
  const W = L.pageW * mm, M = 16 * mm;
  doc.addPage();
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(18).text(`${cfg.brand} — Verification labels`, M, 18 * mm, { width: W - 2 * M });
  doc.font('Helvetica').fontSize(11).fillColor('#444')
    .text(`${p.name}  ·  Batch ${batchId}  ·  ${n.toLocaleString()} units  ·  NAFDAC ${p.nafdac || '—'}  ·  EAN ${p.gtin || '—'}`, M, 27 * mm, { width: W - 2 * M });
  const ruleY = doc.y + 3 * mm;
  doc.moveTo(M, ruleY).lineTo(W - M, ruleY).lineWidth(0.5).strokeColor('#bbb').stroke();
  const sections = [
    ['Read this first', [
      'Every label on the following pages is unique and belongs to exactly ONE bottle. Never print or apply the same label twice.',
      'Each label carries TWO QR codes. They must be applied to the SAME bottle, in the two positions described below.',
      'This document is confidential. The hidden codes inside it can be used to fake genuine products. Do not photograph, scan, email or share these pages beyond the production line; shred spoiled sheets and return unused sheets.',
    ]],
    ['1. Public QR (left, black frame) — "SCAN TO VERIFY PRODUCT"', [
      'Apply on the OUTSIDE of the bottle where the customer can see and scan it in the shop.',
      'Recommended position: back label, near the barcode. Keep at least 3 mm of clear space around the code; do not curve it around a tight edge.',
      'Consumers may scan this code any number of times; it is safe to be visible.',
    ]],
    ['2. Hidden QR (right, red dashed frame) — "HIDDEN CODE — SCRATCH-OFF LABEL"', [
      'Must NOT be visible before purchase. Cover it with a scratch-off panel, or place it under the cap seal or inside the carton.',
      'The scratch-off coating must fully cover the QR and the words under it. Test that a coin removes the coating cleanly without damaging the print.',
      'Do not photograph or record these codes. A visible hidden code lets counterfeiters copy this unit.',
    ]],
    ['3. Print and application checks', [
      'Print at 100% scale (no "fit to page"), 300 dpi or better, black on white. Minimum finished QR size 18 mm; the sheet uses 26 mm.',
      'Before the full run: print ONE page, scan both QRs on a bottle with a phone. Both must open https://verifyproduct.app and show a code reference. If a scan fails, stop and contact the brand.',
      'Keep the unit number (e.g. ' + batchId + '-000001) readable under the codes. It links the bottle to this batch for recalls.',
      'The page header shows product, batch and page number. Use the correct product file for each production line — the NAFDAC number and barcode differ per product.',
    ]],
    ['4. Reconciliation', [
      'Record the unit-number range actually applied per production run and report it to the brand with counts of spoiled/unused labels.',
      'Return or destroy all unused sheets. Any label not applied to a genuine bottle is a security risk.',
    ]],
  ];
  let y = ruleY + 6 * mm;
  for (const [title, lines] of sections) {
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#111').text(title, M, y, { width: W - 2 * M }); y += 6.5 * mm;
    doc.font('Helvetica').fontSize(9.5).fillColor('#222');
    for (const t of lines) { doc.text('•  ' + t, M + 4 * mm, y, { width: W - 2 * M - 4 * mm, lineGap: 1.5 }); y = doc.y + 2.2 * mm; }
    y += 3 * mm;
  }
  doc.fontSize(8).fillColor('#666').text(`Issued ${new Date().toISOString().slice(0, 10)} by ${cfg.brand} via VerifyProduct. Codes are permanent; this sheet is valid for batch ${batchId} only.`, M, L.pageH * mm - 14 * mm, { width: W - 2 * M });
}

for (const p of cfg.products) {
  const mine = units.filter(u => u.productId === p.id);
  const slug = p.name.replace(/\s*\d+ml\s*$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const file = path.join(out, `${cfg.brand.replace(/\s+/g, '-')}-${slug}-${p.id.toUpperCase()}-verification-labels.pdf`);
  const doc = new PDFDocument({ size: [L.pageW * mm, L.pageH * mm], margin: 0, autoFirstPage: false,
    info: { Title: `${p.name} — verification labels — ${batchId}` } });
  doc.pipe(fs.createWriteStream(file));
  const bc = p.gtin ? await barcodePng(p.gtin) : null;
  instructionPage(doc, p, mine.length);
  let idx = 0;
  for (const u of mine) {
    if (idx % (L.cols * L.rows) === 0) {
      doc.addPage();
      doc.fontSize(7).fillColor('#666').text(`${cfg.brand}  ·  ${p.name}  ·  batch ${batchId}  ·  page ${Math.floor(idx / (L.cols * L.rows)) + 1}`, L.margin * mm, 3 * mm);
    }
    const c = idx % L.cols, r = Math.floor(idx / L.cols) % L.rows;
    const x = (L.margin + c * cellW) * mm, y = (L.margin + r * cellH) * mm;
    const w = cellW * mm, h = cellH * mm;
    doc.save().rect(x + 1, y + 1, w - 2, h - 2).lineWidth(0.3).strokeColor('#bbb').dash(2, { space: 2 }).stroke().undash().restore();
    // header
    doc.fillColor('#111').fontSize(9).font('Helvetica-Bold').text(cfg.brand, x + 4 * mm, y + 3 * mm, { width: w - 8 * mm });
    doc.fontSize(7).font('Helvetica').text(p.name, x + 4 * mm, y + 7 * mm, { width: w - 8 * mm });
    // two QRs
    const qw = Math.min((w - 12 * mm) / 2, 26 * mm);
    const qy = y + 12 * mm;
    doc.image(await qr(`${base}/v/${u.tier1Code}`), x + 4 * mm, qy, { width: qw });
    doc.fontSize(5.5).fillColor('#111').text('SCAN TO VERIFY PRODUCT', x + 4 * mm, qy + qw + 1 * mm, { width: qw, align: 'center' });
    const sx = x + w - 4 * mm - qw;
    doc.image(await qr(`${base}/v/${u.tier2Code}`), sx, qy, { width: qw });
    doc.save().rect(sx - 1, qy - 1, qw + 2, qw + 2).lineWidth(0.6).strokeColor('#c0392b').dash(1.5, { space: 1.5 }).stroke().undash().restore();
    doc.fontSize(5.5).fillColor('#c0392b').text('HIDDEN CODE — SCRATCH-OFF LABEL', sx, qy + qw + 1 * mm, { width: qw, align: 'center' });
    // meta
    let my = qy + qw + 5 * mm;
    doc.fillColor('#111').fontSize(6).font('Helvetica');
    if (p.nafdac) { doc.text(`NAFDAC Reg. No: ${p.nafdac}`, x + 4 * mm, my, { width: w - 8 * mm }); my += 3 * mm; }
    doc.text(`Unit: ${u.unitId}`, x + 4 * mm, my, { width: w - 8 * mm }); my += 3 * mm;
    doc.fontSize(5).fillColor('#555').text(`Code ref: ${redactCode(u.tier1Code)}`, x + 4 * mm, my, { width: w - 8 * mm }); my += 3 * mm;
    if (bc) doc.image(bc, x + 4 * mm, my, { height: Math.max(8 * mm, h - (my - y) - 3 * mm) > 14 * mm ? 12 * mm : Math.max(8 * mm, h - (my - y) - 3 * mm) });
    idx++;
  }
  doc.end();
  console.log(`  ${p.id}: ${mine.length} labels → ${path.basename(file)}`);
}

console.log(`\nOutputs in ${out}`);
console.log(`  manifest.json (SECRET, ${units.length} raw tier-2 codes) · import.json · codes.csv · *-labels.pdf · key.txt (BACK UP)`);
console.log(`  sample tier-1: ${base}/v/${redactCode(units[0].tier1Code)}…  sample tier-2 hash: ${units[0].tier2Hash.slice(0, 12)}…`);
