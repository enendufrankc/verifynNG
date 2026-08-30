import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GEO_IP_PORT, GeoIpPort } from './geoip.port';
import { HttpFakeGeoIp } from './http-fake-geoip';
import { MaxMindGeoIp } from './maxmind-geoip';

/**
 * GeoIpModule — registers the correct {@link GeoIpPort} implementation based
 * on the `GEOIP_PROVIDER` env var (`fake` | `maxmind`). Defaults to the HTTP
 * fake used by the compose stack so verification keeps working without extra
 * config.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: GEO_IP_PORT,
      useFactory: (configService: ConfigService): GeoIpPort => {
        const provider = configService.get<string>('GEOIP_PROVIDER');
        switch (provider) {
          case 'maxmind':
            return new MaxMindGeoIp(configService);
          case 'fake':
          default:
            return new HttpFakeGeoIp(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [GEO_IP_PORT],
})
export class GeoIpModule {}
