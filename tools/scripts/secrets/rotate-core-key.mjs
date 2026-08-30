#!/usr/bin/env node
/**
 * pnpm secrets:rotate-core-key [--file docker/secrets/local.env] [--kid k3]
 *
 * Generates a new 32-byte HMAC signing key, appends it to CORE_KEYS_JSON.keys
 * in the given env file, and flips `active` to point at it. Never deletes or
 * overwrites an existing kid. Bootstraps the file (and CORE_KEYS_JSON) if it
 * doesn't exist yet.
 *
 * See docs/security/key-rotation-runbook.md for the deploy/retirement flow.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function parseArgs(argv) {
  const args = { file: 'docker/secrets/local.env', kid: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--kid') args.kid = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(
        'Usage: pnpm secrets:rotate-core-key [--file <path>] [--kid <id>]',
      );
      process.exit(0);
    }
  }
  return args;
}

function parseEnvFile(content) {
  const entries = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.set(key, value);
  }
  return entries;
}

/**
 * Quote a value only if it needs it (leading/trailing whitespace, '#', or a
 * newline) — CORE_KEYS_JSON never does, so it round-trips through
 * EnvFileSecrets' loader (which doesn't unescape quoted strings) unquoted
 * and untouched.
 */
function formatEnvValue(value) {
  const needsQuoting = /^\s|\s$|#|\n/.test(value);
  return needsQuoting ? JSON.stringify(value) : value;
}

function serializeEnvFile(entries) {
  return (
    Array.from(entries.entries())
      .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
      .join('\n') + '\n'
  );
}

function nextKid(existingKids) {
  let n = 1;
  while (existingKids.has(`k${n}`)) n++;
  return `k${n}`;
}

/** Redact a hex secret for display — never print key material to the console. */
function redact(hex) {
  return `${hex.slice(0, 4)}…(${hex.length / 2} bytes)`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const entries = existsSync(args.file)
    ? parseEnvFile(readFileSync(args.file, 'utf-8'))
    : new Map();

  let coreKeys = { active: null, keys: {} };
  if (entries.has('CORE_KEYS_JSON')) {
    try {
      coreKeys = JSON.parse(entries.get('CORE_KEYS_JSON'));
    } catch (err) {
      console.error(
        `Refusing to rotate: existing CORE_KEYS_JSON in ${args.file} is not valid JSON: ${err.message}`,
      );
      process.exit(1);
    }
  }
  coreKeys.keys ??= {};

  const newKid = args.kid ?? nextKid(new Set(Object.keys(coreKeys.keys)));
  if (Object.prototype.hasOwnProperty.call(coreKeys.keys, newKid)) {
    console.error(
      `Refusing to overwrite existing kid "${newKid}". Choose a different --kid.`,
    );
    process.exit(1);
  }

  const previousActive = coreKeys.active;
  const newSecretHex = randomBytes(32).toString('hex');

  coreKeys.keys[newKid] = newSecretHex;
  coreKeys.active = newKid;

  entries.set('CORE_KEYS_JSON', JSON.stringify(coreKeys));

  mkdirSync(dirname(args.file), { recursive: true });
  writeFileSync(args.file, serializeEnvFile(entries), 'utf-8');

  console.log(`Wrote ${args.file}`);
  console.log('--- diff (key material redacted) ---');
  console.log(`  active: ${previousActive ?? '(none)'} -> ${newKid}`);
  console.log(`  keys:   +${newKid} = ${redact(newSecretHex)}`);
  for (const kid of Object.keys(coreKeys.keys)) {
    if (kid !== newKid) console.log(`          ${kid} (unchanged, kept)`);
  }
  console.log(
    '\nNext: restart the api service, confirm new mints carry the new kid,',
  );
  console.log(
    'and never retire a kid while any printed batch still references it',
  );
  console.log('(see docs/security/key-rotation-runbook.md).');
}

main();
