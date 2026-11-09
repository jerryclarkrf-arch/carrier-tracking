// Client-safe navigation maths (no node imports) used by Drive Mode.

export interface NavStep {
  type: string;
  modifier: string | null;
  name: string;
  distance: number;
  location: [number, number];
}

const EARTH_M_PER_DEG_LAT = 110574;

/** Project a position onto the route polyline: how far along, and how far off. */
export function projectOnRoute(
  point: { lat: number; lng: number },
  geometry: [number, number][] // [lng, lat]
): { distanceAlongM: number; offRouteM: number } {
  if (geometry.length < 2) return { distanceAlongM: 0, offRouteM: Number.POSITIVE_INFINITY };

  const mPerDegLng = 111320 * Math.cos((point.lat * Math.PI) / 180);
  const toXY = (lng: number, lat: number) => ({
    x: (lng - point.lng) * mPerDegLng,
    y: (lat - point.lat) * EARTH_M_PER_DEG_LAT,
  });

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let travelled = 0;

  for (let i = 0; i < geometry.length - 1; i += 1) {
    const a = toXY(geometry[i][0], geometry[i][1]);
    const b = toXY(geometry[i + 1][0], geometry[i + 1][1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.hypot(dx, dy);

    let t = 0;
    if (segmentLength > 0) {
      t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (segmentLength * segmentLength)));
    }
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const distance = Math.hypot(cx, cy);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = travelled + t * segmentLength;
    }
    travelled += segmentLength;
  }

  return { distanceAlongM: bestAlong, offRouteM: bestDistance };
}

/** Next manoeuvre given how far along the route the vehicle is. */
export function nextManeuver(
  steps: NavStep[],
  distanceAlongM: number
): { step: NavStep; distanceToM: number; index: number } | null {
  if (steps.length === 0) return null;

  let cumulative = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const isLast = i === steps.length - 1;
    if (!isLast && cumulative > distanceAlongM + 5) {
      return { step, distanceToM: Math.max(0, cumulative - distanceAlongM), index: i };
    }
    cumulative += step.distance;
  }

  const last = steps[steps.length - 1];
  return { step: last, distanceToM: Math.max(0, cumulative - distanceAlongM), index: steps.length - 1 };
}

export function describeStep(step: { type: string; modifier: string | null; name: string }): string {
  const road = step.name ? ` onto ${step.name}` : '';
  const on = step.name ? ` on ${step.name}` : '';
  switch (step.type) {
    case 'depart':
      return step.name ? `Start${on}` : 'Start';
    case 'arrive':
      return 'Arrive at the stop';
    case 'turn':
      return `Turn ${step.modifier ?? ''}${road}`.replace(/\s+/g, ' ').trim();
    case 'new name':
    case 'continue':
      return `Continue${on}`;
    case 'merge':
      return `Merge${road}`;
    case 'on ramp':
      return `Take the ramp${road}`;
    case 'off ramp':
      return `Take the exit${road}`;
    case 'fork':
      return `Keep ${step.modifier ?? 'straight'}${road}`;
    case 'end of road':
      return `Turn ${step.modifier ?? ''}${road}`.replace(/\s+/g, ' ').trim();
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${road}`;
    default:
      return step.name ? `Continue${on}` : 'Continue';
  }
}

export function maneuverGlyph(step: { type: string; modifier: string | null }): string {
  if (step.type === 'arrive') return '◉';
  if (step.type === 'depart') return '●';
  if (step.type === 'roundabout' || step.type === 'rotary') return '⟳';
  const m = step.modifier ?? '';
  if (m.includes('left')) return '←';
  if (m.includes('right')) return '→';
  return '↑';
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Google Maps hand-off that opens real turn-by-turn without an API key. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&utm_source=carrier_load_track&utm_campaign=directions_request`;
}

export function appleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
}
