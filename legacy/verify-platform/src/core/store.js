// core/store.js — JSON-file store behind a thin interface.
// Local milestone 1 only; swap for Firestore/SQL/DO later by implementing this interface.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './crypto.js';

const DB_PATH = path.join(DATA_DIR, 'db.json');

const EMPTY = { tenants: {}, batches: [], units: [], scans: [] };

function load() {
  if (!fs.existsSync(DB_PATH)) return structuredClone(EMPTY);
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

export const store = {
  getTenant(id) { return load().tenants[id] || null; },
  upsertTenant(t) { const db = load(); db.tenants[t.id] = t; save(db); },
  listTenants() { return Object.values(load().tenants); },

  insertBatch(b) { const db = load(); db.batches.push(b); save(db); },
  getBatch(id) { return load().batches.find(b => b.id === id) || null; },
  listBatches(tenantId) { return load().batches.filter(b => !tenantId || b.tenant === tenantId); },

  insertUnits(units) {
    const db = load();
    db.units.push(...units);
    save(db);
  },
  updateUnitState(unitId, state) {
    const db = load();
    const u = db.units.find(u => u.id === unitId);
    if (!u) return null;
    u.state = state;
    u.stateChangedAt = new Date().toISOString();
    save(db);
    return u;
  },
  getUnitByHash(hash) { return load().units.find(u => u.tier2Hash === hash) || null; },
  getUnitById(id) { return load().units.find(u => u.id === id) || null; },
  listUnits(batchId) { return load().units.filter(u => !batchId || u.batch === batchId); },
  countUnits(batchId) { return load().units.filter(u => u.batch === batchId).length; },

  insertScan(scan) { const db = load(); db.scans.push(scan); save(db); },
  scansForUnit(unitId, tier) {
    return load().scans.filter(s => s.unit === unitId && s.tier === tier);
  },
  scansForBatch(batchId) {
    const db = load();
    const ids = new Set(db.units.filter(u => u.batch === batchId).map(u => u.id));
    return db.scans.filter(s => ids.has(s.unit));
  },
  recentScans(limit = 50) {
    const db = load();
    const unitsById = Object.fromEntries(db.units.map(u => [u.id, u]));
    return db.scans.slice(-limit).reverse().map(s => ({ ...s, batch: unitsById[s.unit]?.batch, product: unitsById[s.unit]?.product }));
  },
};
