import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpFakeGeoIp } from './http-fake-geoip';
import type { GeoIpResult } from './geoip.port';

/**
 * Tests for HttpFakeGeoIp against a real in-process HTTP server that mimics the
 * `fake-geo` service from the compose stack.
 */
describe('HttpFakeGeoIp', () => {
  let server: Server;
  let baseUrl: string;
  let slowServer: Server;
  let slowBaseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      const ip = url.searchParams.get('ip');

      if (!ip) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing ip' }));
        return;
      }

      if (ip === '203.0.113.1') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            country: 'US',
            region: 'California',
            city: 'Los Angeles',
            lat: 34.0522,
            lon: -118.2437,
          }),
        );
        return;
      }

      // Default: unknown IP — return nulls.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ country: null, region: null, city: null }));
    });

    slowServer = createServer((_req, res) => {
      // Delay well beyond the 50 ms client timeout.
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ country: 'FR', region: null, city: null }));
      }, 500);
    });

    await Promise.all([
      new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve()),
      ),
      new Promise<void>((resolve) =>
        slowServer.listen(0, '127.0.0.1', () => resolve()),
      ),
    ]);

    const fastPort = (server.address() as AddressInfo).port;
    const slowPort = (slowServer.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${fastPort}`;
    slowBaseUrl = `http://127.0.0.1:${slowPort}`;
  });

  afterAll(async () => {
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => slowServer.close(() => resolve())),
    ]);
  });

  function makeService(url: string): HttpFakeGeoIp {
    const configService = {
      get: (key: string) => (key === 'GEOIP_URL' ? url : undefined),
    } as unknown as ConfigService;
    return new HttpFakeGeoIp(configService);
  }

  it('returns a GeoIpResult for a known IP', async () => {
    const service = makeService(baseUrl);
    const result = await service.lookup('203.0.113.1');

    expect(result).not.toBeNull();
    const geo = result as GeoIpResult;
    expect(geo.country).toBe('US');
    expect(geo.region).toBe('California');
    expect(geo.city).toBe('Los Angeles');
    expect(geo.lat).toBeCloseTo(34.0522, 4);
    expect(geo.lon).toBeCloseTo(-118.2437, 4);
  });

  it('returns null when the server takes longer than the 50 ms timeout', async () => {
    const service = makeService(slowBaseUrl);
    const result = await service.lookup('198.51.100.2');
    expect(result).toBeNull();
  });

  it('returns null on a network error (unreachable URL)', async () => {
    const service = makeService('http://127.0.0.1:1'); // port 1 — connection refused
    const result = await service.lookup('198.51.100.3');
    expect(result).toBeNull();
  });

  it('returns null when the IP parameter is missing/empty', async () => {
    const service = makeService(baseUrl);
    expect(await service.lookup('')).toBeNull();
    // The server answers 400 for a missing ip; client must still resolve null.
    expect(await service.lookup('')).toBeNull();
  });

  it('never throws — non-200 resolves to null', async () => {
    // Reuse the fast server; an empty ip already yields 400 above, but also
    // assert an unknown IP that returns null fields is normalized to null.
    const service = makeService(baseUrl);
    const result = await service.lookup('0.0.0.0');
    // All-null fields -> normalize returns null.
    expect(result).toBeNull();
  });
});
