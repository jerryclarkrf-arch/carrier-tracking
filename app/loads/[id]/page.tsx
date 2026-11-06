'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Nav from '@/components/Nav';
import LoadMap from '@/components/LoadMap';

interface Stop {
  seq: number;
  kind: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
  arrivedAt: string | null;
  departedAt: string | null;
}

interface Tracking {
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
  stops: Stop[];
  pings: { lat: number; lng: number; accuracyM: number | null; recordedAt: string; risk: number }[];
  eta: { stopSeq: number; stopLabel: string | null; distanceM: number; minutes: number; arrivesAt: string } | null;
  lastPingAt: string | null;
}

interface Payload {
  tracking: Tracking;
  carrierSnapshot: { legalName: string | null; docket: string | null; dotStatus: string; authStatus: string; city: string | null; state: string | null } | null;
  driverUrlPath: string;
}

const badge = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-blue-100 text-blue-800';
    case 'delivered':
      return 'bg-emerald-100 text-emerald-800';
    case 'cancelled':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

const timeAgo = (iso: string | null) => {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
};

export default function LoadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/loads/${id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not load this shipment');
        return;
      }
      setData(json as Payload);
      setError(null);
    } catch {
      setError('Could not load this shipment');
    }
  }, [id]);

  useEffect(() => {
    const kick = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 15000);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [load]);

  async function setStatus(status: string) {
    if (!id) return;
    setBusy(true);
    try {
      await fetch(`/api/loads/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function copyDriverLink() {
    if (!data) return;
    const url = `${window.location.origin}${data.driverUrlPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy the driver link:', url);
    }
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-100">
        <Nav />
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          <Link href="/loads" className="mt-4 inline-block text-xs font-semibold text-blue-700 hover:underline">
            ← All loads
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-100">
        <Nav />
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-4" aria-busy="true">
          <div className="h-6 w-48 rounded bg-slate-200 animate-pulse" />
          <div className="h-[360px] rounded-2xl bg-white shadow-sm animate-pulse" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-24 rounded-2xl bg-white shadow-sm animate-pulse" />
            <div className="h-24 rounded-2xl bg-white shadow-sm animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  const t = data.tracking;
  const points = t.pings.map((p) => ({ lat: p.lat, lng: p.lng }));
  const driverUrl = `${window.location.origin}${data.driverUrlPath}`;

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/loads" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              ← All loads
            </Link>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{t.load.reference || 'Load'}</h1>
            <p className="text-sm text-slate-500">
              {t.load.originLabel} → {t.load.destinationLabel}
              {t.load.carrierName && (
                <>
                  {' · '}
                  {t.load.carrierName}
                  {t.load.carrierDot ? ` (DOT ${t.load.carrierDot})` : ''}
                </>
              )}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge(t.load.status)}`}>
            {t.load.status}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <LoadMap points={points} stops={t.stops} />
          <p className="mt-2 text-[11px] text-slate-400">
            Last ping {timeAgo(t.lastPingAt)} · {t.pings.length} ping{t.pings.length === 1 ? '' : 's'} · refreshes
            every 15s
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Next stop ETA</p>
            {t.eta ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-800">{t.eta.stopLabel ?? 'Next stop'}</p>
                <p className="text-xs text-slate-500">
                  {(t.eta.distanceM / 1000).toFixed(1)} km · ~{t.eta.minutes} min ·{' '}
                  {new Date(t.eta.arrivesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {t.lastPingAt ? 'All stops reached.' : 'Waiting for the first ping.'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Driver link</p>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-600">{driverUrl}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyDriverLink}
                className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50"
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <a
                href={data.driverUrlPath}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Open as driver
              </a>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Works in a phone browser — the driver keeps the tab open while driving.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Stops</p>
          <ul className="mt-2 space-y-2">
            {t.stops.map((s) => (
              <li
                key={s.seq}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.arrivedAt ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  <span className="font-semibold text-slate-700">
                    {s.kind === 'pickup' ? 'Pickup' : s.kind === 'drop' ? 'Drop-off' : 'Stop'}
                  </span>
                  <span className="text-slate-500">{s.label}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {s.arrivedAt
                    ? `arrived ${new Date(s.arrivedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'pending'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Carrier snapshot</p>
            {data.carrierSnapshot ? (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <p className="text-sm font-semibold text-slate-900">{data.carrierSnapshot.legalName}</p>
                <p>
                  {data.carrierSnapshot.docket ? `MC ${data.carrierSnapshot.docket} · ` : ''}DOT {t.load.carrierDot}
                </p>
                <p>
                  DOT status: {data.carrierSnapshot.dotStatus} · Authority: {data.carrierSnapshot.authStatus}
                </p>
                {(data.carrierSnapshot.city || data.carrierSnapshot.state) && (
                  <p>{[data.carrierSnapshot.city, data.carrierSnapshot.state].filter(Boolean).join(', ')}</p>
                )}
                <p className="text-[11px] text-slate-400">Captured when the load was created.</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No carrier was assigned.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Actions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {t.load.status !== 'delivered' && (
                <button
                  type="button"
                  onClick={() => setStatus('delivered')}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  Mark delivered
                </button>
              )}
              {t.load.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => setStatus('cancelled')}
                  disabled={busy}
                  className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
                >
                  Cancel load
                </button>
              )}
              {(t.load.status === 'delivered' || t.load.status === 'cancelled') && (
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  Reactivate
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Delivered and cancelled loads free up an active-track slot.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}


