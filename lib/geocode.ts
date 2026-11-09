import { query } from '@/lib/db';

/**
 * Free, key-less geocoding.
 *  - US Census geocoder: authoritative US street addresses + ZIP (no quota)
 *  - Photon (OSM): type-ahead suggestions, house numbers and places
 *  - Zippopotam: fast ZIP -> city centre
 * Results are cached in `geocode_cache` so repeat queries never leave the DB.
 */
export interface GeoHit {
  label: string;
  lat: number;
  lng: number;
  source: 'census' | 'photon' | 'zip' | 'cache';
}

const USER_AGENT = 'CarrierLoadTrack/1.0 (load tracking; contact via carrier-tracking.vercel.app)';
const normKey = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

async function readCache(key: string): Promise<GeoHit | null> {
  try {
    const rows = await query<{ label: string; lat: number; lng: number; source: string }>(
      'SELECT label, lat, lng, source FROM geocode_cache WHERE query_key = $1',
      [key]
    );
    const r = rows[0];
    if (!r || r.lat === null || r.lng === null) return null;
    return { label: r.label, lat: Number(r.lat), lng: Number(r.lng), source: 'cache' };
  } catch {
    return null;
  }
}

async function writeCache(key: string, hit: GeoHit) {
  try {
    await query(
      `INSERT INTO geocode_cache (query_key, label, lat, lng, source)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (query_key) DO UPDATE
         SET label = EXCLUDED.label, lat = EXCLUDED.lat, lng = EXCLUDED.lng, source = EXCLUDED.source`,
      [key, hit.label, hit.lat, hit.lng, hit.source]
    );
  } catch {
    // cache is best-effort
  }
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function photon(q: string, limit: number): Promise<GeoHit[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }[];
    };
    const features = json.features ?? [];
    const hits: GeoHit[] = [];

    for (const f of features) {
      const p = f.properties ?? {};
      if (String(p.countrycode ?? '').toUpperCase() !== 'US' && String(p.country ?? '') !== 'United States') {
        continue;
      }
      const coords = f.geometry?.coordinates;
      const lng = Array.isArray(coords) ? num(coords[0]) : null;
      const lat = Array.isArray(coords) ? num(coords[1]) : null;
      if (lat === null || lng === null) continue;

      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const locality = [p.city, [p.state, p.postcode].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ');
      // Postal-style labels are what a broker recognises; named places
      // (e.g. "Hartsfield-Jackson Airport") are the fallback.
      const label =
        street && locality
          ? `${street}, ${locality}`
          : street || locality || String(p.name ?? '') || '';
      if (!label) continue;
      hits.push({ label, lat, lng, source: 'photon' });
    }
    return hits;
  } catch {
    return [];
  }
}

/** Type-ahead suggestions (US only), deduplicated by label. */
export async function suggestAddresses(q: string, limit = 5): Promise<GeoHit[]> {
  const query_ = q.trim();
  if (query_.length < 5) return [];
  const hits = await photon(query_, limit + 3);
  const seen = new Set<string>();
  return hits
    .filter((h) => {
      const key = h.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

async function census(q: string): Promise<GeoHit | null> {
  try {
    const url =
      'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
      `?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[] };
    };
    const match = json.result?.addressMatches?.[0];
    const lat = num(match?.coordinates?.y);
    const lng = num(match?.coordinates?.x);
    if (!match || lat === null || lng === null) return null;
    return {
      label: String(match.matchedAddress ?? q).replace(/\b([A-Z]{2}), /g, '$1 '),
      lat,
      lng,
      source: 'census',
    };
  } catch {
    return null;
  }
}

async function zipCentre(zip: string): Promise<GeoHit | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      places?: { 'place name'?: string; state?: string; latitude?: string; longitude?: string }[];
    };
    const place = json.places?.[0];
    const lat = num(place?.latitude);
    const lng = num(place?.longitude);
    if (!place || lat === null || lng === null) return null;
    return {
      label: `${place['place name'] ?? ''}, ${place.state ?? ''} ${zip}`.trim(),
      lat,
      lng,
      source: 'zip',
    };
  } catch {
    return null;
  }
}

/** Resolve one address string (or ZIP) to coordinates. */
export async function resolveAddress(q: string): Promise<GeoHit | null> {
  const raw = q.trim();
  if (!raw) return null;

  const key = normKey(raw);
  const cached = await readCache(key);
  if (cached) return cached;

  const hit = /^\d{5}$/.test(raw)
    ? (await zipCentre(raw)) ?? (await census(raw))
    : (await census(raw)) ?? (await photon(raw, 1))[0] ?? null;

  if (hit) await writeCache(key, hit);
  return hit;
}
