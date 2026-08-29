import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { get } from 'node:http';
import { GeoIpPort, GeoIpResult } from './geoip.port';

/**
 * HttpFakeGeoIp — talks to the local `fake-geo` service in the compose stack.
 *
 * A geo failure must NEVER prevent a verification, so every error path
 * (timeout, network error, non-200, bad JSON) resolves to `null` instead of
 * throwing. The 50 ms timeout keeps tier-2 verdicts fast even when fake-geo is
 * slow or unreachable.
 */
@Injectable()
export class HttpFakeGeoIp implements GeoIpPort {
  private readonly geoipUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.geoipUrl = this.configService.get<string>('GEOIP_URL')!;
  }

  async lookup(ip: string): Promise<GeoIpResult | null> {
    if (!ip) {
      return null;
    }

    const url = new URL(`${this.geoipUrl}/lookup`);
    url.searchParams.set('ip', ip);

    return new Promise<GeoIpResult | null>((resolve) => {
      let settled = false;
      const done = (result: GeoIpResult | null) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      const req = get(
        url,
        { timeout: 50 },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            done(null);
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              done(HttpFakeGeoIp.normalize(body));
            } catch {
              done(null);
            }
          });
          res.on('error', () => done(null));
        },
      );

      req.on('timeout', () => {
        req.destroy();
        done(null);
      });
      req.on('error', () => done(null));
    });
  }

  private static normalize(body: unknown): GeoIpResult | null {
    if (!body || typeof body !== 'object') {
      return null;
    }
    const obj = body as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.length > 0 ? v : null;
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;

    const country = str(obj.country);
    const region = str(obj.region);
    const city = str(obj.city);
    const lat = num(obj.lat);
    const lon = num(obj.lon);

    if (!country && !region && !city && lat === null && lon === null) {
      return null;
    }

    const result: GeoIpResult = { country, region, city };
    if (lat !== null) result.lat = lat;
    if (lon !== null) result.lon = lon;
    return result;
  }
}

