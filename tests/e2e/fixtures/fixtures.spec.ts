import { test, expect } from '@playwright/test';
import { loadManifest } from './manifest.js';

test.describe('fixture self-check', () => {
  test('loadManifest reads the seed manifest', () => {
    // This test requires the realistic seed to have been run first
    // In CI, global-setup runs the seed
    const manifest = loadManifest();
    expect(manifest.tenants).toBeDefined();
    expect(Object.keys(manifest.tenants).length).toBeGreaterThan(0);
  });
});
