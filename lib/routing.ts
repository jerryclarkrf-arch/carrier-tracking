import { query } from '@/lib/db';

/**
 * Turn-by-turn routing via OSRM. The public demo server is fine for a pilot
 * (reasonable, non-commercial use, <=1 req/s, no uptime guarantee), so results
 * are cached and the API throttles per load. Swap the base URL for a paid or
 * self-hosted router before commercial launch.
 */
export interface RouteStep {
  type: string;
  modifier: string | null;
  name: string;
  distance: number; // metres
  duration: number; // seconds
  location: [number, number]; // [lng, lat]
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  geometry: [number, number][]; // [lng, lat]
  steps: RouteStep[];
  cached: boolean;
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const CACHE_TTL_MS = 30 * 60 * 1000;
const USER_AGENT = 'CarrierLoadTrack/1.0 (load tracking)';

type LatLng = { lat: number; lng: number };
const routeKey = (a: LatLng, b: LatLng) =>
  `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

export async function getRoute(from: LatLng, to: LatLng, allowNetwork = true): Promise<RouteResult | null> {
  const key = routeKey(from, to);

  try {
    const rows = await query<{
      distance_m: number;
      duration_s: number;
      geometry: [number, number][];
      steps: RouteStep[];
      created_at: string;
    }>('SELECT distance_m, duration_s, geometry, steps, created_at FROM route_cache WHERE route_key = $1', [key]);
    const row = rows[0];
    if (row && Date.now() - new Date(row.created_at).getTime() < CACHE_TTL_MS) {
      return {
        distanceM: Number(row.distance_m),
        durationS: Number(row.duration_s),
        geometry: row.geometry ?? [],
        steps: row.steps ?? [],
        cached: true,
      };
    }
  } catch {
    // cache miss / table missing — fall through to OSRM
  }

  if (!allowNetwork) return null;

  try {
    const url =
      `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}` +
      '?overview=full&geometries=geojson&steps=true&alternatives=false';
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      routes?: {
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: {
          steps?: {
            distance?: number;
            duration?: number;
            name?: string;
            maneuver?: { type?: string; modifier?: string; location?: [number, number] };
          }[];
        }[];
      }[];
    };

    const route = json.routes?.[0];
    if (!route) return null;

    const geometry = route.geometry?.coordinates ?? [];
    const steps: RouteStep[] = (route.legs?.[0]?.steps ?? []).map((s) => ({
      type: s.maneuver?.type ?? 'continue',
      modifier: s.maneuver?.modifier ?? null,
      name: s.name ?? '',
      distance: Number(s.distance) || 0,
      duration: Number(s.duration) || 0,
      location: s.maneuver?.location ?? [0, 0],
    }));

    const result: RouteResult = {
      distanceM: Number(route.distance) || 0,
      durationS: Number(route.duration) || 0,
      geometry,
      steps,
      cached: false,
    };

    try {
      await query(
        `INSERT INTO route_cache (route_key, distance_m, duration_s, geometry, steps)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
         ON CONFLICT (route_key) DO UPDATE
           SET distance_m = EXCLUDED.distance_m, duration_s = EXCLUDED.duration_s,
               geometry = EXCLUDED.geometry, steps = EXCLUDED.steps, created_at = now()`,
        [key, result.distanceM, result.durationS, JSON.stringify(geometry), JSON.stringify(steps)]
      );
    } catch {
      // cache is best-effort
    }

    return result;
  } catch {
    return null;
  }
}

/** Per-load throttle so a driver never hammers the routing service. */
const lastCall = new Map<string, number>();
export function routingAllowed(loadId: string, minIntervalMs = 60_000): boolean {
  const now = Date.now();
  const previous = lastCall.get(loadId) ?? 0;
  if (now - previous < minIntervalMs) return false;
  lastCall.set(loadId, now);
  return true;
}
