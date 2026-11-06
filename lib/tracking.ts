import { averageSpeedMps, etaTo } from '@/lib/geo';
import type { LoadRow, PingRow, StopRow } from '@/lib/loads';

export interface TrackingPayload {
  load: {
    id: string;
    reference: string | null;
    status: string;
    carrierName: string | null;
    carrierDot: string | null;
    originLabel: string | null;
    destinationLabel: string | null;
    deliveredAt: string | null;
    updatedAt: string;
  };
  stops: {
    seq: number;
    kind: string;
    label: string | null;
    lat: number | null;
    lng: number | null;
    arrivedAt: string | null;
    departedAt: string | null;
  }[];
  pings: {
    lat: number;
    lng: number;
    accuracyM: number | null;
    recordedAt: string;
    risk: number;
  }[];
  eta: {
    stopSeq: number;
    stopLabel: string | null;
    distanceM: number;
    minutes: number;
    arrivesAt: string;
  } | null;
  lastPingAt: string | null;
}

/** Shared shaping for the broker detail view and the public token endpoints. */
export function buildTracking(load: LoadRow, stops: StopRow[], pings: PingRow[]): TrackingPayload {
  const chrono = [...pings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const latest = chrono[chrono.length - 1] ?? null;
  const speed = averageSpeedMps(chrono.map((p) => ({ ...p, recorded_at: p.recorded_at })).reverse());

  let eta: TrackingPayload['eta'] = null;
  const nextStop = stops.find((s) => s.lat !== null && s.lng !== null && !s.arrived_at);
  if (latest && nextStop && nextStop.lat !== null && nextStop.lng !== null) {
    const calc = etaTo({ lat: latest.lat, lng: latest.lng }, { lat: nextStop.lat, lng: nextStop.lng }, speed);
    eta = {
      stopSeq: nextStop.seq,
      stopLabel: nextStop.label,
      distanceM: calc.distanceM,
      minutes: calc.minutes,
      arrivesAt: calc.arrivesAt,
    };
  }

  return {
    load: {
      id: load.id,
      reference: load.reference,
      status: load.status,
      carrierName: load.carrier_name,
      carrierDot: load.carrier_dot,
      originLabel: load.origin?.label ?? null,
      destinationLabel: load.destination?.label ?? null,
      deliveredAt: load.delivered_at,
      updatedAt: load.updated_at,
    },
    stops: stops.map((s) => ({
      seq: s.seq,
      kind: s.kind,
      label: s.label,
      lat: s.lat,
      lng: s.lng,
      arrivedAt: s.arrived_at,
      departedAt: s.departed_at,
    })),
    pings: chrono.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      accuracyM: p.accuracy_m,
      recordedAt: p.recorded_at,
      risk: p.risk,
    })),
    eta,
    lastPingAt: latest?.recorded_at ?? null,
  };
}
