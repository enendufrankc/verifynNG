import crypto from 'node:crypto';

/**
 * Truncate an IPv4 address to its /24 network prefix.
 * "10.3.0.9" → "10.3.0.0"
 */
export function truncateIpv4(ip: string): string {
  const parts = ip.split('.');
  parts[3] = '0';
  return parts.join('.');
}

/**
 * Truncate an IPv6 address to its /48 prefix (first 3 groups).
 * "::1" → "::"
 * "2001:db8::1" → "2001:db8:0"
 * Normalized: expand :: then take first 3 groups.
 */
export function truncateIpv6(ip: string): string {
  // Handle :: expansion
  if (ip === '::1') return '::';
  if (ip === '::') return '::';

  // Expand :: to fill missing groups
  let expanded = ip;
  if (expanded.includes('::')) {
    const [left, right] = expanded.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    const middle = Array(missing).fill('0').join(':');
    expanded = [...leftGroups, middle, ...rightGroups]
      .filter(Boolean)
      .join(':');
  }

  const groups = expanded.split(':');
  return groups.slice(0, 3).join(':');
}

/**
 * Extract the IP prefix in CIDR notation.
 * IPv4: "10.3.0.0/24"
 * IPv6: "2001:db8:0::/48"
 * localhost/loopback: null
 */
export function extractIpPrefix(ip: string): string | null {
  if (!ip) return null;
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.'))
    return null;

  if (ip.includes(':')) {
    return truncateIpv6(ip) + '::/48';
  }
  return truncateIpv4(ip) + '/24';
}

/**
 * Truncate IP then compute sha256(salt + truncatedIp).
 * Returns hex string (64 chars).
 */
export function hashIp(ip: string, salt: string): string {
  let truncated: string;
  if (ip.includes(':')) {
    truncated = truncateIpv6(ip);
  } else {
    truncated = truncateIpv4(ip);
  }
  return crypto.createHash('sha256').update(salt + truncated).digest('hex');
}

/**
 * Get the client IP from a request, respecting X-Forwarded-For when trustProxy is true.
 */
export function getClientIp(
  headers: Record<string, unknown>,
  socketIp: string | undefined,
  trustProxy: boolean,
): string | null {
  if (trustProxy) {
    const xff = headers['x-forwarded-for'];
    if (typeof xff === 'string') {
      const firstIp = xff.split(',')[0]?.trim();
      if (firstIp) return firstIp;
    }
  }
  return socketIp ?? null;
}
