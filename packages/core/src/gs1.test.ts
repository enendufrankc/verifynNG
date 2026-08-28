import { describe, it, expect } from 'vitest';
import { toGs1DigitalLink, parseGs1DigitalLink } from './gs1.js';

describe('toGs1DigitalLink', () => {
  it('builds a URI with GTIN only', () => {
    const uri = toGs1DigitalLink({
      baseUrl: 'https://verify.example.com',
      gtin: '01234567890123',
    });
    expect(uri).toBe('https://verify.example.com/01/01234567890123');
  });

  it('includes lot when provided', () => {
    const uri = toGs1DigitalLink({
      baseUrl: 'https://verify.example.com',
      gtin: '01234567890123',
      lot: 'BATCH001',
    });
    expect(uri).toBe(
      'https://verify.example.com/01/01234567890123/10/BATCH001',
    );
  });

  it('includes serial when provided', () => {
    const uri = toGs1DigitalLink({
      baseUrl: 'https://verify.example.com',
      gtin: '01234567890123',
      serial: 'UNIT42',
    });
    expect(uri).toBe('https://verify.example.com/01/01234567890123/21/UNIT42');
  });

  it('includes both lot and serial', () => {
    const uri = toGs1DigitalLink({
      baseUrl: 'https://verify.example.com',
      gtin: '01234567890123',
      lot: 'BATCH001',
      serial: 'UNIT42',
    });
    expect(uri).toBe(
      'https://verify.example.com/01/01234567890123/10/BATCH001/21/UNIT42',
    );
  });

  it('strips trailing slash from baseUrl', () => {
    const uri = toGs1DigitalLink({
      baseUrl: 'https://verify.example.com/',
      gtin: '01234567890123',
    });
    expect(uri).toBe('https://verify.example.com/01/01234567890123');
  });

  it('omits lot/serial when empty string', () => {
    const uri = toGs1DigitalLink({
      baseUrl: 'https://verify.example.com',
      gtin: '01234567890123',
      lot: '',
      serial: '',
    });
    expect(uri).toBe('https://verify.example.com/01/01234567890123');
  });
});

describe('parseGs1DigitalLink', () => {
  it('parses GTIN-only URI', () => {
    const result = parseGs1DigitalLink(
      'https://verify.example.com/01/01234567890123',
    );
    expect(result).not.toBeNull();
    expect(result!.gtin).toBe('01234567890123');
    expect(result!.lot).toBeUndefined();
    expect(result!.serial).toBeUndefined();
  });

  it('parses URI with lot', () => {
    const result = parseGs1DigitalLink(
      'https://verify.example.com/01/01234567890123/10/BATCH001',
    );
    expect(result).not.toBeNull();
    expect(result!.gtin).toBe('01234567890123');
    expect(result!.lot).toBe('BATCH001');
  });

  it('parses URI with serial', () => {
    const result = parseGs1DigitalLink(
      'https://verify.example.com/01/01234567890123/21/UNIT42',
    );
    expect(result).not.toBeNull();
    expect(result!.gtin).toBe('01234567890123');
    expect(result!.serial).toBe('UNIT42');
  });

  it('parses URI with lot and serial', () => {
    const result = parseGs1DigitalLink(
      'https://verify.example.com/01/01234567890123/10/BATCH001/21/UNIT42',
    );
    expect(result).not.toBeNull();
    expect(result!.gtin).toBe('01234567890123');
    expect(result!.lot).toBe('BATCH001');
    expect(result!.serial).toBe('UNIT42');
  });

  it('returns null for non-GS1 URIs', () => {
    expect(parseGs1DigitalLink('https://example.com/other/path')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    // 'not-a-url' doesn't throw in Node's new URL() — it normalizes it
    // We need something that actually throws
    expect(parseGs1DigitalLink('')).toBeNull();
  });

  it('parses URI with serial but no lot', () => {
    const result = parseGs1DigitalLink(
      'https://verify.example.com/01/01234567890123/21/UNIT42',
    );
    expect(result).not.toBeNull();
    expect(result!.gtin).toBe('01234567890123');
    expect(result!.lot).toBeUndefined();
    expect(result!.serial).toBe('UNIT42');
  });

  it('parses URI with unknown application identifiers', () => {
    // Unknown AI '99' should be ignored (enters the implicit else of else-if)
    const result = parseGs1DigitalLink(
      'https://example.com/01/01234567890123/99/IGNORED',
    );
    expect(result).not.toBeNull();
    expect(result!.gtin).toBe('01234567890123');
    expect(result!.lot).toBeUndefined();
    expect(result!.serial).toBeUndefined();
  });

  it('returns null for URI where GTIN is empty after filtering', () => {
    // pathname after split and filter results in empty GTIN
    // This would be like /01// which after filter becomes ['01', '']
    // Actually new URL normalizes this. Let's try /01 directly without value
    const result = parseGs1DigitalLink('https://example.com/01/');
    expect(result).toBeNull();
  });

  it('round-trips through build and parse', () => {
    const params = {
      baseUrl: 'https://verify.example.com',
      gtin: '01234567890123',
      lot: 'BATCH001',
      serial: 'UNIT42',
    };
    const uri = toGs1DigitalLink(params);
    const parsed = parseGs1DigitalLink(uri);
    expect(parsed).not.toBeNull();
    expect(parsed!.gtin).toBe(params.gtin);
    expect(parsed!.lot).toBe(params.lot);
    expect(parsed!.serial).toBe(params.serial);
  });
});
