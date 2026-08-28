// core/sheet.js — QR sheet + exports generation (shared by CLI and admin API)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const EXPORTS_DIR = path.resolve(ROOT, '../../exports');

export async function generateExports(manifest) {
  const dir = path.join(EXPORTS_DIR, manifest.batch);
  fs.mkdirSync(path.join(dir, 'qr'), { recursive: true });

  const cards = [];
  for (const u of manifest.units) {
    const [qr1Png, qr2Png] = await Promise.all([
      QRCode.toBuffer(`${manifest.baseUrl}/v/${u.tier1Code}`, { width: 300, margin: 1 }),
      QRCode.toBuffer(`${manifest.baseUrl}/v/${u.tier2Code}`, { width: 300, margin: 1 }),
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

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR Sheet ${manifest.batch}</title>
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
<h1>${manifest.tenant.toUpperCase()} — QR Application Sheet</h1>
<h2>Batch ${manifest.batch} · ${manifest.product.name} · ${manifest.count} units · OEM: ${manifest.oem}</h2>
<div class="grid">${cards.join('')}</div>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'qr-sheet.html'), html);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { dir, files: ['qr-sheet.html', 'manifest.json', `qr/ (${manifest.units.length * 2} pngs)`] };
}
