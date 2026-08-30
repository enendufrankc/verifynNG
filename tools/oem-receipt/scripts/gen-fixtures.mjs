import { generateCode, StaticKeyRing } from '@verifynng/core';
import { writeFileSync } from 'node:fs';

const ring = new StaticKeyRing(
  'k1:0000000000000000000000000000000000000000000000000000000000000000',
  'k1',
);

function codes(watermark, count) {
  return Array.from({ length: count }, (_, i) => {
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2, watermark });
    return { serial: i + 1, tier2Code: code };
  });
}

function toCsv(rows) {
  const header = 'serial,tier2Code';
  const lines = rows.map((r) => `${r.serial},${r.tier2Code}`);
  return [header, ...lines].join('\n') + '\n';
}

const ok = codes('T7HX', 20);
writeFileSync(new URL('../fixtures/printed-ok.csv', import.meta.url), toCsv(ok));

const swapped = codes('T7HX', 19);
const foreign = codes('FRGN', 1)[0];
swapped.push({ serial: 20, tier2Code: foreign.tier2Code });
writeFileSync(new URL('../fixtures/printed-swapped.csv', import.meta.url), toCsv(swapped));

console.log('Generated fixtures/printed-ok.csv and fixtures/printed-swapped.csv');
