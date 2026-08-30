import { describe, it, expect } from 'vitest';
import {
  VERDICTS,
  ERROR_STATE,
  verdictTone,
  TONE_CLASSES,
  type VerdictOrError,
} from './verdict';

describe('verdictTone', () => {
  const allStates: VerdictOrError[] = [...VERDICTS, ERROR_STATE];

  it('maps every verdict (and the client-only error state) to a tone', () => {
    for (const verdict of allStates) {
      expect(() => verdictTone(verdict)).not.toThrow();
      expect(Object.keys(TONE_CLASSES)).toContain(verdictTone(verdict));
    }
  });

  it('gives the two positive verdicts the same tone', () => {
    expect(verdictTone('ok')).toBe(verdictTone('authentic'));
  });

  it('gives already-verified a distinct tone from the positive verdicts', () => {
    expect(verdictTone('already-verified')).not.toBe(verdictTone('ok'));
  });

  it('gives flagged, decommissioned and unknown distinct tones from each other', () => {
    const tones = new Set([
      verdictTone('flagged'),
      verdictTone('decommissioned'),
      verdictTone('unknown'),
    ]);
    expect(tones.size).toBe(3);
  });
});

describe('TONE_CLASSES', () => {
  it('has non-empty class strings for every field of every tone', () => {
    for (const cls of Object.values(TONE_CLASSES)) {
      for (const value of Object.values(cls)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
