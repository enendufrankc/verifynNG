import { describe, it, expect } from 'vitest';
import * as isolationMatrixModule from './isolation-matrix';
import allowlist from './allowlist.json';

describe('isolationMatrix', () => {
  it('module exports the isolationMatrix function', () => {
    expect(typeof isolationMatrixModule.isolationMatrix).toBe('function');
  });

  it('module exports the classifyRoutes function', () => {
    expect(typeof isolationMatrixModule.classifyRoutes).toBe('function');
  });

  it('allowlist.json has valid structure', () => {
    expect(allowlist.publicRoutes).toBeInstanceOf(Array);
    expect(allowlist.publicRoutes.length).toBeGreaterThan(0);
    for (const entry of allowlist.publicRoutes) {
      expect(entry).toHaveProperty('method');
      expect(entry).toHaveProperty('path');
      expect(entry).toHaveProperty('justification');
      expect(typeof entry.justification).toBe('string');
      expect(entry.justification.length).toBeGreaterThan(0);
    }
  });
});
