export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Average ground speed from the most recent ping pairs, clamped to sane road speeds. */
export function averageSpeedMps(
  pings: { lat: number; lng: number; recorded_at: string }[]
): number | null {
  if (pings.length < 2) return null;
  let distance = 0;
  let seconds = 0;
  for (let i = 1; i < pings.length; i += 1) {
    const prev = pings[i - 1];
    const cur = pings[i];
    const dt = (new Date(cur.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000;
    if (dt <= 0) continue;
    distance += haversineM({ lat: prev.lat, lng: prev.lng }, { lat: cur.lat, lng: cur.lng });
    seconds += dt;
  }
  if (seconds === 0) return null;
  const speed = distance / seconds;
  if (!Number.isFinite(speed) || speed <= 0) return null;
  return Math.min(30, Math.max(8, speed)); // 29–108 km/h
}

export interface Eta {
  distanceM: number;
  minutes: number;
  arrivesAt: string;
}

/** Rough ETA to a stop; uses recent speed, else a 22 m/s (≈79 km/h) assumption. */
export function etaTo(from: LatLng, to: LatLng, speedMps: number | null): Eta {
  const distanceM = haversineM(from, to);
  const speed = speedMps ?? 22;
  const minutes = Math.max(1, Math.round(distanceM / speed / 60));
  return {
    distanceM: Math.round(distanceM),
    minutes,
    arrivesAt: new Date(Date.now() + minutes * 60000).toISOString(),
  };
}
