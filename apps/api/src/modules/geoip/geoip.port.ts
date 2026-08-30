export const GEO_IP_PORT = Symbol('GEO_IP_PORT');

export interface GeoIpResult {
  country: string | null;
  region: string | null;
  city: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface GeoIpPort {
  lookup(ip: string): Promise<GeoIpResult | null>;
}
