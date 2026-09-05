import dns from 'node:dns/promises';
import { Injectable, BadRequestException } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';

/** IPv4/IPv6 ranges no webhook endpoint may resolve to (SSRF guard). */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
    if (lower === '::' || lower.startsWith('::ffff:0:0')) return true;
    return false;
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;

  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

@Injectable()
export class WebhookUrlValidator {
  /**
   * Rejects (400) a URL that isn't a plausible external HTTPS webhook
   * endpoint. https required outside compose (WEBHOOKS_ALLOW_HTTP);
   * resolves the hostname and rejects private/loopback/link-local ranges
   * unless WEBHOOKS_ALLOW_PRIVATE=true (compose only). Redirects are never
   * followed by the delivery processor (T10) — this only validates the
   * URL given at creation/update time.
   */
  async assertSafe(rawUrl: string): Promise<void> {
    const env = loadEnv();
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException({
        type: 'validation',
        message: 'url is not a valid URL',
        details: [{ field: 'url', issue: 'must be a valid absolute URL' }],
      });
    }

    if (
      url.protocol !== 'https:' &&
      !(env.WEBHOOKS_ALLOW_HTTP && url.protocol === 'http:')
    ) {
      throw new BadRequestException({
        type: 'validation',
        message: 'url must use https',
        details: [{ field: 'url', issue: 'must use https' }],
      });
    }

    if (env.WEBHOOKS_ALLOW_PRIVATE) return;

    let addresses: string[];
    try {
      const resolved = await dns.lookup(url.hostname, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch {
      throw new BadRequestException({
        type: 'validation',
        message: `url hostname "${url.hostname}" could not be resolved`,
        details: [{ field: 'url', issue: 'hostname does not resolve' }],
      });
    }

    if (addresses.some(isPrivateIp)) {
      throw new BadRequestException({
        type: 'validation',
        message:
          'url resolves to a private/loopback address, which is not allowed',
        details: [{ field: 'url', issue: 'resolves to a private address' }],
      });
    }
  }
}
