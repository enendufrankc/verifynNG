#!/usr/bin/env node
// Wrapper for the `lighthouse` npm script — `lhci autorun` re-invokes itself
// internally (autorun -> healthcheck/collect/assert as separate processes)
// and does not forward unrecognised CLI flags like `--url` across that
// boundary, so this parses `--url` up front and re-execs `lhci autorun`
// with LIGHTHOUSE_URL_OVERRIDE set instead — an env var, which does survive
// lhci's internal re-invocations. See lighthouserc.js for the config side.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const urlArg = process.argv.find((a) => a.startsWith('--url='));
const env = { ...process.env };
if (urlArg) env.LIGHTHOUSE_URL_OVERRIDE = urlArg.slice('--url='.length);

const lhciBin = path.resolve(__dirname, '../node_modules/.bin/lhci');
const result = spawnSync(lhciBin, ['autorun', '--config=./lighthouserc.js'], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
