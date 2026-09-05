// Contract test: tools/fakes/pay's request/response shapes vs. recorded
// real-Paystack fixtures in apps/api/src/modules/billing/__fixtures__/
// paystack/*.json — so the fake can't silently drift from the fields
// PaystackGateway actually reads. Not a full deep-equal against every
// documented Paystack field (bin, signature, ip_address, ...) — only the
// ones apps/api/src/modules/billing/paystack.gateway.ts consumes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app } from './server.mjs';

const fixturesDir = fileURLToPath(
  new URL('../../../apps/api/src/modules/billing/__fixtures__/paystack/', import.meta.url),
);
function fixture(name) {
  return JSON.parse(readFileSync(`${fixturesDir}${name}.json`, 'utf8'));
}

/** Asserts every path in `paths` (dot-notation) is present in `obj`. */
function assertHasPaths(obj, paths, label) {
  for (const path of paths) {
    const value = path.split('.').reduce((o, k) => o?.[k], obj);
    assert.notStrictEqual(value, undefined, `${label}: missing "${path}"`);
  }
}

const INITIALIZE_PATHS = ['status', 'data.authorization_url', 'data.reference'];
const VERIFY_PATHS = [
  'status',
  'data.reference',
  'data.status',
  'data.amount',
  'data.currency',
  'data.authorization.authorization_code',
  'data.authorization.last4',
  'data.authorization.card_type',
];
const CHARGE_AUTH_PATHS = ['status', 'data.reference', 'data.status', 'data.gateway_response'];
const WEBHOOK_PATHS = [
  'event',
  'data.id',
  'data.reference',
  'data.status',
  'data.amount',
  'data.currency',
];

test('recorded fixtures carry every path the fake and PaystackGateway rely on', () => {
  assertHasPaths(fixture('initialize'), INITIALIZE_PATHS, 'initialize fixture');
  assertHasPaths(fixture('verify'), VERIFY_PATHS, 'verify fixture');
  assertHasPaths(fixture('charge_authorization'), CHARGE_AUTH_PATHS, 'charge_authorization fixture');
  assertHasPaths(fixture('webhook-charge-success'), WEBHOOK_PATHS, 'webhook fixture');
});

test('POST /transaction/initialize matches the fixture shape', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/transaction/initialize',
    payload: {
      reference: 'contract-init-1',
      amount: 10000,
      currency: 'NGN',
      email: 'buyer@example.com',
      callback_url: 'http://localhost:3001/billing',
    },
  });
  assert.equal(res.statusCode, 200);
  assertHasPaths(res.json(), INITIALIZE_PATHS, 'fake initialize response');
});

test('GET /transaction/verify/:reference matches the fixture shape once paid', async () => {
  await app.inject({
    method: 'POST',
    url: '/transaction/initialize',
    payload: { reference: 'contract-verify-1', amount: 10000, currency: 'NGN' },
  });
  await app.inject({
    method: 'POST',
    url: '/checkout/contract-verify-1/pay',
    payload: { last4: '4081' },
  });
  const res = await app.inject({ method: 'GET', url: '/transaction/verify/contract-verify-1' });
  assert.equal(res.statusCode, 200);
  assertHasPaths(res.json(), VERIFY_PATHS, 'fake verify response');
});

test('POST /transaction/charge_authorization matches the fixture shape', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/transaction/charge_authorization',
    payload: {
      authorization_code: 'AUTH_contract1',
      email: 'buyer@example.com',
      amount: 10000,
      currency: 'NGN',
      reference: 'contract-charge-1',
    },
  });
  assert.equal(res.statusCode, 200);
  assertHasPaths(res.json(), CHARGE_AUTH_PATHS, 'fake charge_authorization response');
});
