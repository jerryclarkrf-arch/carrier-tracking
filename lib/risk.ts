import { haversineM } from '@/lib/geo';

/**
 * Ping-integrity heuristics.
 *
 * These are risk *indicators*, not proof: a flagged ping means the data is
 * physically or contextually implausible and deserves a human look. We never
 * claim a device is spoofed — the UI says so explicitly.
 */
export type FlagSeverity = 1 | 2 | 3;

export interface RiskFlag {
  code: string;
  severity: FlagSeverity;
  detail: string;
}

export interface PingLike {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  recordedAt: string;
  receivedAt?: string;
  userAgent?: string | null;
}

export interface IpGeo {
  lat: number;
  lng: number;
}

export interface AssessInput {
  current: PingLike;
  previous: PingLike | null;
  recent: PingLike[]; // chronological, oldest first
  ipGeo: IpGeo | null;
  loadStatus: string;
}

const MPS_TO_MPH = 2.23694;
const GAP_SECONDS = 30 * 60;
const IMPLAUSIBLE_MPS = 45; // ~100 mph
const TELEPORT_MPS = 60; // ~134 mph
const IP_MISMATCH_M = 300_000;
const STATIONARY_SPAN_S = 2 * 60 * 60;
const STATIONARY_RADIUS_M = 150;

export function assessPing({ current, previous, recent, ipGeo, loadStatus }: AssessInput): {
  risk: number;
  flags: RiskFlag[];
} {
  const flags: RiskFlag[] = [];
  const received = Date.parse(current.receivedAt ?? new Date().toISOString());
  const recorded = Date.parse(current.recordedAt);

  if (!Number.isFinite(recorded)) {
    flags.push({ code: 'bad_timestamp', severity: 2, detail: 'Unparseable timestamp' });
  } else {
    if (recorded - received > 2 * 60_000) {
      flags.push({ code: 'future_timestamp', severity: 3, detail: 'Timestamp is ahead of server time' });
    }
    if (received - recorded > 24 * 60 * 60_000) {
      flags.push({ code: 'stale_timestamp', severity: 2, detail: 'Timestamp is more than a day old' });
    }
  }

  const accuracy = typeof current.accuracyM === 'number' ? current.accuracyM : null;
  if (accuracy !== null) {
    if (accuracy > 2000) {
      flags.push({ code: 'low_accuracy', severity: 2, detail: `GPS accuracy ±${Math.round(accuracy)} m` });
    } else if (accuracy > 500) {
      flags.push({ code: 'low_accuracy', severity: 1, detail: `GPS accuracy ±${Math.round(accuracy)} m` });
    }
  }

  if (previous) {
    const previousRecorded = Date.parse(previous.recordedAt);
    const deltaSeconds = (recorded - previousRecorded) / 1000;
    const distance = haversineM(previous, current);

    if (Number.isFinite(deltaSeconds) && deltaSeconds <= 0) {
      flags.push({
        code: 'duplicate_timestamp',
        severity: 1,
        detail: 'Same or earlier timestamp as the previous ping',
      });
    } else if (Number.isFinite(deltaSeconds)) {
      const speed = distance / deltaSeconds;
      if (speed > TELEPORT_MPS) {
        flags.push({
          code: 'teleport',
          severity: 3,
          detail: `${(distance / 1000).toFixed(0)} km in ${Math.round(deltaSeconds)} s (~${Math.round(
            speed * MPS_TO_MPH
          )} mph)`,
        });
      } else if (speed > IMPLAUSIBLE_MPS) {
        flags.push({
          code: 'implausible_speed',
          severity: 3,
          detail: `Implied speed ~${Math.round(speed * MPS_TO_MPH)} mph`,
        });
      }
      if (loadStatus === 'active' && deltaSeconds > GAP_SECONDS && speed <= IMPLAUSIBLE_MPS) {
        flags.push({
          code: 'signal_gap',
          severity: 1,
          detail: `No ping for ${Math.round(deltaSeconds / 60)} min`,
        });
      }
    }

    if (previous.userAgent && current.userAgent && previous.userAgent !== current.userAgent) {
      flags.push({ code: 'device_change', severity: 2, detail: 'Browser/device changed mid-load' });
    }
  }

  if (recent.length >= 3) {
    const window = recent.slice(-4);
    const first = window[0];
    const spanSeconds = (recorded - Date.parse(first.recordedAt)) / 1000;
    const spread = Math.max(...window.map((p) => haversineM(first, p)));
    if (Number.isFinite(spanSeconds) && spanSeconds > STATIONARY_SPAN_S && spread < STATIONARY_RADIUS_M) {
      flags.push({
        code: 'stationary',
        severity: 1,
        detail: 'Position unchanged for over 2 h — GPS may be frozen',
      });
    }
  }

  if (ipGeo) {
    const distance = haversineM(ipGeo, current);
    if (distance > IP_MISMATCH_M) {
      flags.push({
        code: 'ip_location_mismatch',
        severity: 2,
        detail: `Network is ${Math.round(distance / 1000)} km from the reported position`,
      });
    }
  }

  const risk = flags.reduce((max, f) => Math.max(max, f.severity), 0);
  return { risk, flags };
}

export interface Reliability {
  score: number | null;
  totalPings: number;
  flaggedPings: number;
  cleanRatio: number;
  gapRate: number;
  onTime: boolean | null;
  byCode: Record<string, number>;
}

/** Simple, explainable score: clean pings (75%) + no signal gaps (25%), -10 if late. */
export function reliabilityFrom(
  pings: { risk: number; flags: unknown }[],
  deliveredAt: string | null,
  deliverAt: string | null
): Reliability {
  const total = pings.length;
  const byCode: Record<string, number> = {};
  let flagged = 0;
  let gaps = 0;

  for (const ping of pings) {
    const raw = Array.isArray(ping.flags) ? ping.flags : [];
    const codes = raw
      .map((f) => {
        if (typeof f === 'string') return f;
        if (f && typeof f === 'object' && 'code' in f) return String((f as { code: unknown }).code);
        return '';
      })
      .filter(Boolean);

    if (ping.risk > 0 || codes.length > 0) flagged += 1;
    for (const code of codes) {
      byCode[code] = (byCode[code] ?? 0) + 1;
      if (code === 'signal_gap') gaps += 1;
    }
  }

  const onTime =
    deliveredAt && deliverAt ? new Date(deliveredAt).getTime() <= new Date(deliverAt).getTime() : null;

  if (total === 0) {
    return { score: null, totalPings: 0, flaggedPings: 0, cleanRatio: 1, gapRate: 0, onTime, byCode };
  }

  const cleanRatio = (total - flagged) / total;
  const gapRate = gaps / total;
  let score = 100 * (0.75 * cleanRatio + 0.25 * (1 - gapRate));
  if (onTime === false) score -= 10;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    totalPings: total,
    flaggedPings: flagged,
    cleanRatio,
    gapRate,
    onTime,
    byCode,
  };
}

export const FLAG_LABELS: Record<string, string> = {
  implausible_speed: 'Implausible speed',
  teleport: 'Position jump',
  low_accuracy: 'Low GPS accuracy',
  signal_gap: 'Signal gap',
  ip_location_mismatch: 'Network vs position',
  device_change: 'Device change',
  stationary: 'Frozen position',
  future_timestamp: 'Timestamp ahead',
  stale_timestamp: 'Old timestamp',
  duplicate_timestamp: 'Duplicate timestamp',
  bad_timestamp: 'Bad timestamp',
};

export const RISK_COPY =
  'Flags are risk indicators, not proof of spoofing. Review the trip before acting on them.';

