'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import LoadMap from '@/components/LoadMap';
import {
  describeStep,
  formatDistance,
  googleMapsUrl,
  maneuverGlyph,
  nextManeuver,
  projectOnRoute,
  type NavStep,
} from '@/lib/nav';

interface TrackPayload {
  kind: string;
  load: {
    id: string;
    reference: string | null;
    status: string;
    carrierName: string | null;
    originLabel: string | null;
    destinationLabel: string | null;
  };
  stops: {
    seq: number;
    kind: string;
    label: string | null;
    lat: number | null;
    lng: number | null;
    arrivedAt: string | null;
  }[];
  pings: { lat: number; lng: number; recordedAt: string }[];
  eta: { stopLabel: string | null; distanceM: number; minutes: number; arrivesAt: string } | null;
  lastPingAt: string | null;
}

const MIN_INTERVAL_MS = 60_000;
const MIN_MOVE_M = 300;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function DriverPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [data, setData] = useState<TrackPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [state, setState] = useState<'idle' | 'waiting' | 'live' | 'denied' | 'unsupported'>('idle');
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const watchRef = useRef<number | null>(null);
  const lastSend = useRef<{ at: number; lat: number; lng: number } | null>(null);

  // Drive Mode
  const [routeInfo, setRouteInfo] = useState<{
    geometry: [number, number][];
    steps: NavStep[];
    distanceM: number;
    durationS: number;
  } | null>(null);
  const [destination, setDestination] = useState<{ lat: number; lng: number; label: string | null } | null>(null);
  const [maneuver, setManeuver] = useState<{ glyph: string; text: string; distanceM: number } | null>(null);
  const [arrival, setArrival] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [routeProblem, setRouteProblem] = useState<string | null>(null);

  const routeRef = useRef<typeof routeInfo>(null);
  const voiceRef = useRef(true);
  const offRouteRef = useRef(0);
  const spokenRef = useRef<Set<string>>(new Set());
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/track/${token}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'This tracking link is not available.');
        return;
      }
      setData(json as TrackPayload);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    }
  }, [token]);

  useEffect(() => {
    const kick = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(kick);
  }, [refresh]);

  const speak = useCallback((text: string) => {
    if (!voiceRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    } catch {
      /* TTS unavailable */
    }
  }, []);

  const buzz = useCallback(() => {
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* unsupported */
    }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      wakeRef.current = await nav.wakeLock.request('screen');
    } catch {
      /* denied or unsupported */
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeRef.current?.release();
    } catch {
      /* ignore */
    }
    wakeRef.current = null;
  }, []);

  const loadRoute = useCallback(
    async (at?: { lat: number; lng: number }) => {
      if (!token) return;
      try {
        const res = await fetch('/api/route', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, lat: at?.lat, lng: at?.lng }),
        });
        const json = await res.json();
        if (!res.ok) return;

        setDestination(json.destination ?? null);
        if (json.route) {
          const nextRoute = {
            geometry: (json.route.geometry ?? []) as [number, number][],
            steps: (json.route.steps ?? []) as NavStep[],
            distanceM: Number(json.route.distanceM) || 0,
            durationS: Number(json.route.durationS) || 0,
          };
          routeRef.current = nextRoute;
          setRouteInfo(nextRoute);
          setRouteProblem(null);
          offRouteRef.current = 0;
          // A new route means new maneuvers — let the driver hear them again.
          spokenRef.current.clear();
        } else {
          setRouteProblem(String(json.reason ?? 'routing_unavailable'));
        }
      } catch {
        setRouteProblem('routing_unavailable');
      }
    },
    [token]
  );

  const updateNav = useCallback(
    (at: { lat: number; lng: number }) => {
      const route = routeRef.current;
      if (!route || route.geometry.length < 2 || route.steps.length === 0) return;

      const { distanceAlongM, offRouteM } = projectOnRoute(at, route.geometry);
      offRouteRef.current = offRouteM > 100 ? offRouteRef.current + 1 : 0;

      const next = nextManeuver(route.steps, distanceAlongM);
      if (!next) return;

      setManeuver({
        glyph: maneuverGlyph(next.step),
        text: describeStep(next.step),
        distanceM: next.distanceToM,
      });

      for (const threshold of [800, 300, 80]) {
        if (next.distanceToM > threshold) continue;
        const key = `${next.index}:${threshold}`;
        if (spokenRef.current.has(key)) break;
        spokenRef.current.add(key);
        speak(
          threshold === 80
            ? `${describeStep(next.step)} now`
            : `In ${threshold} metres, ${describeStep(next.step)}`
        );
        break;
      }

      if (offRouteRef.current >= 2) {
        offRouteRef.current = 0;
        void loadRoute(at);
      }
    },
    [speak, loadRoute]
  );

  const handleEvents = useCallback(
    (events: string[]) => {
      let message: string | null = null;
      if (events.includes('delivered')) {
        message = 'Delivery confirmed — thanks for sharing your location.';
        speak('Delivery confirmed.');
      } else if (events.includes('drop')) {
        message = 'You have arrived at the drop-off.';
        speak('You have arrived at the drop-off.');
      } else if (events.includes('pickup')) {
        message = 'You have arrived at the pickup.';
        speak('You have arrived at the pickup.');
      }
      if (!message) return;
      setArrival(message);
      buzz();
      window.setTimeout(() => setArrival(null), 8000);
    },
    [speak, buzz]
  );

  const sendPing = useCallback(
    async (pos: GeolocationPosition) => {
      if (!token) return;
      const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const previous = lastSend.current;
      const due =
        !previous ||
        Date.now() - previous.at >= MIN_INTERVAL_MS ||
        metres(previous, at) >= MIN_MOVE_M;
      if (!due) return;

      try {
        const res = await fetch('/api/pings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            lat: at.lat,
            lng: at.lng,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
            heading: Number.isFinite(pos.coords.heading ?? NaN) ? pos.coords.heading : undefined,
            speed: Number.isFinite(pos.coords.speed ?? NaN) ? pos.coords.speed : undefined,
            recordedAt: new Date(pos.timestamp).toISOString(),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { events?: string[]; error?: string };

        if (res.ok) {
          lastSend.current = { at: Date.now(), ...at };
          setLastSentAt(new Date().toISOString());
          setSentCount((c) => c + 1);
          setAccuracy(Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null);
          setState('live');
          setNotice(null);
          updateNav(at);
          if (Array.isArray(json.events) && json.events.length > 0) handleEvents(json.events);
          return;
        }

        if (res.status === 410) setError(json.error || 'This link has expired.');
        else if (res.status !== 429) setNotice(json.error || 'Could not send your location.');
      } catch {
        setNotice('Network hiccup — will retry on the next update.');
      }
    },
    [token, updateNav, handleEvents]
  );

  const stopSharing = useCallback(() => {
    if (watchRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    void releaseWakeLock();
    setSharing(false);
    setState('idle');
  }, [releaseWakeLock]);

  // The browser drops the wake lock whenever the tab hides; re-acquire and
  // refresh the route when the driver comes back.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || !sharing) return;
      void acquireWakeLock();
      void loadRoute();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sharing, acquireWakeLock, loadRoute]);

  function startSharing() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unsupported');
      return;
    }
    setSharing(true);
    setState('waiting');
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => void sendPing(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setState('denied');
        else setNotice('GPS signal is weak — moving outdoors helps.');
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    void acquireWakeLock();
    void loadRoute();
    speak('Tracking started. Drive safely.');
  }

  useEffect(() => {
    if (!sharing) return;
    const timer = setInterval(() => void refresh(), 45000);
    return () => clearInterval(timer);
  }, [sharing, refresh]);

  useEffect(
    () => () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    },
    []
  );

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Tracking link not available</p>
          <p className="mt-2 text-xs text-slate-500">{error}</p>
          <p className="mt-4 text-[11px] text-slate-400">Ask the broker to send a fresh link.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-md space-y-3 px-4 py-8" aria-busy="true">
          <div className="h-24 rounded-2xl bg-white shadow-sm animate-pulse" />
          <div className="h-32 rounded-2xl bg-white shadow-sm animate-pulse" />
          <div className="h-16 rounded-2xl bg-white shadow-sm animate-pulse" />
        </div>
      </main>
    );
  }

  const delivered = data.load.status === 'delivered' || data.load.status === 'cancelled';
  const nextStop = data.stops.find((s) => !s.arrivedAt);

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-xs font-extrabold text-white">
            LT
          </span>
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-slate-900">Share your location</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Carrier Load Track</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        {arrival && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {arrival}
          </div>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Load</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">{data.load.reference || 'Unnamed load'}</p>
          <p className="text-sm text-slate-600">
            {data.load.originLabel} → {data.load.destinationLabel}
          </p>
          {data.load.carrierName && <p className="mt-1 text-xs text-slate-500">{data.load.carrierName}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                delivered ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {data.load.status}
            </span>
            {nextStop && (
              <span className="text-slate-500">
                Next: {nextStop.kind === 'pickup' ? 'Pickup' : 'Drop-off'} · {nextStop.label}
              </span>
            )}
          </div>
        </div>

        {!delivered && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {maneuver ? (
              <div className="flex items-center gap-3 bg-blue-600 px-4 py-3 text-white">
                <span className="text-2xl leading-none">{maneuver.glyph}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{maneuver.text}</p>
                  <p className="text-[11px] text-blue-100">in {formatDistance(maneuver.distanceM)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceOn((v) => {
                      voiceRef.current = !v;
                      return !v;
                    });
                  }}
                  className="rounded-lg border border-white/40 px-2 py-1 text-[11px] font-semibold"
                  aria-label="Toggle voice guidance"
                >
                  {voiceOn ? 'Voice on' : 'Muted'}
                </button>
              </div>
            ) : (
              <div className="px-4 py-2 text-xs text-slate-500">
                {routeProblem === 'routing_unavailable'
                  ? 'Turn-by-turn unavailable right now — use Open in Maps.'
                  : routeProblem === 'throttled'
                    ? 'Updating the route…'
                    : 'Route ready — waiting for GPS.'}
              </div>
            )}

            <LoadMap
              points={[]}
              stops={data.stops.map((s) => ({
                kind: s.kind,
                label: s.label,
                lat: s.lat,
                lng: s.lng,
                arrivedAt: s.arrivedAt,
              }))}
              route={routeInfo?.geometry}
              height={220}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <p className="text-[11px] text-slate-500">
                {routeInfo
                  ? `${formatDistance(routeInfo.distanceM)} · ~${Math.max(1, Math.round(routeInfo.durationS / 60))} min`
                  : 'Open in Maps for turn-by-turn'}
              </p>
              {destination && (
                <a
                  href={googleMapsUrl(destination.lat, destination.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700"
                >
                  Open in Google Maps
                </a>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {delivered ? (
            <p className="text-sm font-semibold text-emerald-700">This load is closed — no more location needed.</p>
          ) : !sharing ? (
            <>
              <p className="text-sm text-slate-700">Tap start, then keep this screen open while driving.</p>
              <button
                type="button"
                onClick={startSharing}
                className="w-full rounded-xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Start sharing location
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    state === 'live' ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
                <p className="text-sm font-semibold text-slate-800">
                  {state === 'live'
                    ? 'Sharing live'
                    : state === 'denied'
                      ? 'Location permission denied'
                      : 'Waiting for GPS…'}
                </p>
              </div>
              {state === 'denied' && (
                <p className="text-xs text-rose-700">
                  Allow location access in your browser settings, then tap start again.
                </p>
              )}
              <button
                type="button"
                onClick={stopSharing}
                className="w-full rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Stop sharing
              </button>
            </>
          )}
          {state === 'unsupported' && (
            <p className="text-xs text-rose-700">This browser does not support location sharing.</p>
          )}
          {notice && <p className="text-xs text-amber-700">{notice}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pings sent" value={String(sentCount)} />
          <Stat label="Last sent" value={lastSentAt ? timeAgo(lastSentAt) : '—'} />
          <Stat label="Accuracy" value={accuracy !== null ? `${accuracy} m` : '—'} />
        </div>

        {data.eta && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">ETA</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{data.eta.stopLabel ?? 'Next stop'}</p>
            <p className="text-xs text-slate-500">
              {(data.eta.distanceM / 1000).toFixed(1)} km · ~{data.eta.minutes} min ·{' '}
              {new Date(data.eta.arrivesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400">
          Your location is only shared while this page is open, and only with the broker who booked the load.
          Locking the screen or switching apps pauses updates on most phones.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-slate-800">{value}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}


