import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoIpPort, GeoIpResult } from './geoip.port';

/**
 * MaxMindGeoIp — production GeoIP implementation backed by a local MaxMind
 * GeoLite2 / GeoIP2 `.mmdb` database file.
 *
 * This is a stub: until a MaxMind DB is provisioned in the environment, every
 * lookup resolves to `null`. A geo failure must never prevent a verification.
 * The real `maxmind` reader will be wired in when the integration is needed.
 */
@Injectable()
export class MaxMindGeoIp implements GeoIpPort {
  private readonly mmdbPath: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.mmdbPath = this.configService.get<string>('GEOIP_MMDB_PATH');
  }

  async lookup(_ip: string): Promise<GeoIpResult | null> {
    if (!this.mmdbPath) {
      return null;
    }
    // Stub — returns null until the MaxMind reader is implemented.
    return null;
  }
}
