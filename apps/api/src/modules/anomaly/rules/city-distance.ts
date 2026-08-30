/**
 * Bundled city centroid table for the `duplicate_first` rule's distance
 * check. Deliberately not exhaustive — covers `tools/fakes/geo`'s table plus
 * a few common references. Evidence never stores coordinates, only the
 * looked-up city/country names; this table exists purely to *compute* a
 * distance at evaluation time, never to persist one.
 */
const CITY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  Lagos: { lat: 6.524, lon: 3.379 },
  Kano: { lat: 12.0, lon: 8.517 },
  Accra: { lat: 5.556, lon: -0.187 },
  Nairobi: { lat: -1.286, lon: 36.817 },
  London: { lat: 51.507, lon: -0.128 },
  Abuja: { lat: 9.072, lon: 7.491 },
  'Port Harcourt': { lat: 4.815, lon: 7.049 },
  Ibadan: { lat: 7.378, lon: 3.947 },
};

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distance in km between two city names, or `null` when either city is
 * unknown or the cities are the same (distance can't inform the rule).
 */
export function cityDistanceKm(cityA: string, cityB: string): number | null {
  if (!cityA || !cityB || cityA === cityB) return null;
  const a = CITY_CENTROIDS[cityA];
  const b = CITY_CENTROIDS[cityB];
  if (!a || !b) return null;
  return haversineKm(a, b);
}
