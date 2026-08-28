// core/verify.js — verification logic. Verdicts are computed, never stored.
import { isValidFormat, parseCode, codeHash } from './crypto.js';
import { store } from './store.js';

function geoFromIp(ip) {
  // Local milestone: crude IP classification only (no external geo service).
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return 'Local network';
  return 'Unknown region';
}

function productName(unit) {
  const t = store.getTenant(unit.tenant);
  const p = t?.products?.find(p => p.id === unit.product);
  return p?.name || unit.product;
}

function partial(code) {
  const parts = code.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2].slice(0, 4)}…`;
}

export function verify({ code, ip, userAgent }) {
  const scannedAt = new Date().toISOString();
  const geo = geoFromIp(ip || '');

  if (!isValidFormat(code)) {
    return { verdict: 'invalid', reason: 'Code format is not valid — check that you scanned the full code.', code: partial(code || '') };
  }

  const { tenant, tier } = parseCode(code);

  // ── TIER 1: public QR — stateless, unlimited scans ──────────────────
  if (tier === '1') {
    const found = store.listUnits().find(u => u.tier1Code === code) || null;
    if (!found) {
      return { verdict: 'unknown', reason: 'This public code is not in our registry. If this was scanned on a bottle, the product line may be counterfeit.', code: partial(code) };
    }
    const batch = store.getBatch(found.batch);
    store.insertScan({ unit: found.id, tier: 1, at: scannedAt, ip, geo, userAgent, verdict: 'ok' });
    return {
      verdict: 'ok',
      tier: 1,
      tenant,
      product: productName(found),
      batch: { id: batch.id, oem: batch.oem, commissionedAt: batch.createdAt },
      message: 'This is a genuine IVORY GLOW product line. For full unit authentication, find the hidden scratch-off code inside the pack.',
      scanCount: store.scansForUnit(found.id, 1).length,
    };
  }

  // ── TIER 2: hidden unit code — stateful, anomaly-scored ─────────────
  const unit = store.getUnitByHash(codeHash(code));
  if (!unit) {
    return { verdict: 'unknown', reason: 'This verification code does not exist in our registry. This product is likely counterfeit. Please report it.', code: partial(code) };
  }

  // unit lifecycle checks
  if (unit.state === 'decommissioned') {
    return { verdict: 'decommissioned', tier: 2, tenant, unit: unit.id, code: partial(code),
      message: 'This code has been withdrawn by the brand (recall or fraud investigation). Contact the seller.' };
  }
  const flagged = unit.state === 'flagged';

  const prior = store.scansForUnit(unit.id, 2);
  store.insertScan({ unit: unit.id, tier: 2, at: scannedAt, ip, geo, userAgent, verdict: 'ok' });
  const all = [...prior, { at: scannedAt, geo }];

  // anomaly signals
  const geos = new Set(all.map(s => s.geo));
  const first = prior.length === 0;
  const suspicious = all.length > 5 && geos.size > 1;

  let verdict = 'authentic';
  if (!first) verdict = 'already-verified';
  if (suspicious) verdict = 'suspicious';
  if (flagged) verdict = 'flagged';

  const batch = store.getBatch(unit.batch);
  return {
    verdict,
    tier: 2,
    tenant,
    unit: unit.id,
    product: productName(unit),
    batch: { id: batch.id, oem: batch.oem, commissionedAt: batch.createdAt },
    firstVerifiedAt: first ? scannedAt : prior[0].at,
    scanCount: all.length,
    distinctRegions: [...geos],
    message: flagged
      ? 'The brand has flagged this code after suspicious activity. Treat this product with caution and report the seller.'
      : first
      ? 'You are the first person to verify this unit. Genuine, purchased new.'
      : suspicious
        ? 'This code has been verified multiple times in different regions — possible counterfeit duplication. Treat with caution and report.'
        : `This unit was first verified on ${new Date(prior[0].at).toUTCString()} and has been verified ${all.length} time(s). Normal for resale or shared use.`,
    code: partial(code),
  };
}
