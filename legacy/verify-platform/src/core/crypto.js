// core/crypto.js — code format, signing, hashing
// Code: <tenant>.<tier>.<payload>.<checksum>
// payload := base32 crypto-random (20 chars ≈ 100 bits entropy)
// checksum := HMAC-SHA256(payload + tenant + tier, SECRET) truncated to 8 base32 chars
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(ROOT, '../../data');
const SECRET_PATH = path.join(DATA_DIR, '.secret');

// Crockford base32 (no I, L, O, U — avoids transcription errors)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ensureSecret() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SECRET_PATH)) {
    fs.writeFileSync(SECRET_PATH, crypto.randomBytes(32).toString('hex'));
  }
  return fs.readFileSync(SECRET_PATH, 'utf8').trim();
}

function hmac(msg) {
  return crypto.createHmac('sha256', ensureSecret()).update(msg).digest();
}

export function randomBase32(len = 20) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

function toBase32(buf, len) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % 32];
  return out;
}

export function checksum(tenant, tier, payload) {
  return toBase32(hmac(`${tenant}|${tier}|${payload}`), 8);
}

export function makeCode(tenant, tier) {
  const t = tenant.toLowerCase();
  const payload = randomBase32(20);
  return `${t}.${tier}.${payload}.${checksum(t, tier, payload)}`;
}

export function parseCode(code) {
  const parts = String(code || '').trim().toUpperCase().split('.');
  if (parts.length !== 4) return null;
  const [tenantRaw, tier, payload, chk] = parts;
  const tenant = tenantRaw.toLowerCase();
  if (!tenant || !['1', '2'].includes(tier) || payload.length < 12) return null;
  return { tenant, tier, payload, chk };
}

export function isValidFormat(code) {
  const p = parseCode(code);
  return !!p && p.chk === checksum(p.tenant, p.tier, p.payload);
}

// Storage hash — what goes in the DB. Never the raw code.
export function codeHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Manifest signature (M2 will add OEM receipt flow; signature now)
export function signManifest(manifestObj) {
  const canonical = JSON.stringify(manifestObj);
  return hmac(canonical).toString('hex');
}
