import { describe, it, expect } from 'vitest';
import {
  truncateIpv4,
  truncateIpv6,
  extractIpPrefix,
  hashIp,
  getClientIp,
} from './ip-utils';

describe('truncateIpv4', () => {
  it('truncates to /24 by zeroing the last octet', () => {
    expect(truncateIpv4('10.3.0.9')).toBe('10.3.0.0');
    expect(truncateIpv4('192.168.1.100')).toBe('192.168.1.0');
  });
});

describe('truncateIpv6', () => {
  it('handles ::1 loopback', () => {
    expect(truncateIpv6('::1')).toBe('::');
  });

  it('handles :: unspecified', () => {
    expect(truncateIpv6('::')).toBe('::');
  });

  it('expands :: and takes first 3 groups', () => {
    expect(truncateIpv6('2001:db8::1')).toBe('2001:db8:0');
  });

  it('expands fe80::1', () => {
    expect(truncateIpv6('fe80::1')).toBe('fe80:0:0');
  });
});

describe('extractIpPrefix', () => {
  it('returns /24 CIDR for IPv4', () => {
    expect(extractIpPrefix('10.3.0.9')).toBe('10.3.0.0/24');
  });

  it('returns /48 CIDR for IPv6', () => {
    expect(extractIpPrefix('2001:db8::1')).toBe('2001:db8:0::/48');
  });

  it('returns null for 127.0.0.1', () => {
    expect(extractIpPrefix('127.0.0.1')).toBeNull();
  });

  it('returns null for ::1', () => {
    expect(extractIpPrefix('::1')).toBeNull();
  });

  it('returns null for 192.168.x private range', () => {
    expect(extractIpPrefix('192.168.1.50')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractIpPrefix('')).toBeNull();
  });
});

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    const hash = hashIp('10.3.0.9', 'salty');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    expect(hashIp('10.3.0.9', 'salty')).toBe(hashIp('10.3.0.9', 'salty'));
  });

  it('produces different output for different salts', () => {
    expect(hashIp('10.3.0.9', 'salt-a')).not.toBe(hashIp('10.3.0.9', 'salt-b'));
  });

  it('produces the same hash for IPs in the same /24 with the same salt', () => {
    // 10.3.0.9 and 10.3.0.200 both truncate to 10.3.0.0
    expect(hashIp('10.3.0.9', 'salty')).toBe(hashIp('10.3.0.200', 'salty'));
  });

  it('produces different hashes for IPs in different /24s', () => {
    expect(hashIp('10.3.0.9', 'salty')).not.toBe(hashIp('10.3.1.9', 'salty'));
  });
});

describe('getClientIp', () => {
  it('returns socketIp when no X-Forwarded-For header', () => {
    expect(getClientIp({}, '203.0.113.5', true)).toBe('203.0.113.5');
  });

  it('returns first IP from X-Forwarded-For when trustProxy is true', () => {
    const headers = { 'x-forwarded-for': '203.0.113.10, 198.51.100.20' };
    expect(getClientIp(headers, '10.0.0.1', true)).toBe('203.0.113.10');
  });

  it('ignores X-Forwarded-For when trustProxy is false', () => {
    const headers = { 'x-forwarded-for': '203.0.113.10' };
    expect(getClientIp(headers, '10.0.0.1', false)).toBe('10.0.0.1');
  });

  it('returns null when no socketIp and no X-Forwarded-For', () => {
    expect(getClientIp({}, undefined, true)).toBeNull();
  });

  it('returns socketIp when X-Forwarded-For is present but trustProxy is false', () => {
    const headers = { 'x-forwarded-for': '203.0.113.10' };
    expect(getClientIp(headers, undefined, false)).toBeNull();
  });

  it('falls back to socketIp when X-Forwarded-For header is not a string', () => {
    const headers = { 'x-forwarded-for': ['203.0.113.10'] };
    expect(getClientIp(headers, '10.0.0.1', true)).toBe('10.0.0.1');
  });
});
