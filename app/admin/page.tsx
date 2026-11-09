'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import LoadMap from '@/components/LoadMap';
import { ALERT_LABELS } from '@/lib/alert-labels';

interface AdminLoad {
  id: string;
  reference: string | null;
  status: string;
  carrier_name: string | null;
  carrier_dot: string | null;
  origin_label: string | null;
  destination_label: string | null;
  created_at: string;
  delivered_at: string | null;
  broker_email: string | null;
  last_ping_at: string | null;
  ping_count: number;
  flagged_pings: number;
}

interface BrokerRow {
  id: string;
  email: string | null;
  plan: string;
  active_track_quota: number;
  load_count: number;
  active_count: number;
  last_load_at: string | null;
}

interface ActivityRow {
  id: string;
  kind: string;
  created_at: string;
  broker_email: string | null;
  reference: string | null;
  load_id: string | null;
}

interface Vehicle {
  id: string;
  reference: string | null;
  lat: number;
  lng: number;
  recorded_at: string;
}

interface Overview {
  kpis: {
    brokers: number;
    loads: Record<string, number>;
    totalLoads: number;
    pings24h: number;
    flagged24h: number;
    activeTracks: number;
  };
  loads: AdminLoad[];
  brokers: BrokerRow[];
  activity: ActivityRow[];
  vehicles: Vehicle[];
}

const statusBadge = (status: string) =>
  status === 'active'
    ? 'bg-blue-100 text-blue-800'
    : status === 'delivered'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'cancelled'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-slate-100 text-slate-600';

const timeAgo = (iso: string | null) => {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/overview')
      .then(async (r) => {
        if (r.status === 403) {
          if (!cancelled) setForbidden(true);
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'failed');
        return j as Overview;
      })
      .then((j) => {
        if (!cancelled && j) setData(j);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the admin overview.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Master view</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every broker, load, tracked vehicle and flag in one place.
          </p>
        </div>

        {forbidden && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This account is not an admin. Add your email to the <span className="font-mono">ADMIN_EMAILS</span>{' '}
            environment variable to enable this view.
          </div>
        )}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {!data && !error && !forbidden && (
          <div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-white shadow-sm animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Kpi label="Brokers" value={data.kpis.brokers} />
              <Kpi label="Active tracks" value={data.kpis.activeTracks} tone="text-blue-700" />
              <Kpi label="Total loads" value={data.kpis.totalLoads} />
              <Kpi label="Pings 24h" value={data.kpis.pings24h} />
              <Kpi
                label="Flagged 24h"
                value={data.kpis.flagged24h}
                tone={data.kpis.flagged24h > 0 ? 'text-rose-600' : 'text-slate-800'}
              />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Active vehicles</p>
                <p className="text-[11px] text-slate-500">{data.vehicles.length} reporting</p>
              </div>
              <LoadMap
                points={[]}
                stops={[]}
                vehicles={data.vehicles.map((v) => ({
                  lat: v.lat,
                  lng: v.lng,
                  label: `${v.reference ?? v.id.slice(0, 8)} · ${timeAgo(v.recorded_at)}`,
                }))}
                height={320}
              />
            </section>

            <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">All loads</p>
                <p className="text-[11px] text-slate-500">{data.loads.length} shown</p>
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Ref</th>
                    <th className="px-4 py-2 text-left">Broker</th>
                    <th className="px-4 py-2 text-left">Carrier</th>
                    <th className="px-4 py-2 text-left">Lane</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Pings</th>
                    <th className="px-4 py-2 text-left">Flags</th>
                    <th className="px-4 py-2 text-left">Last ping</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.loads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">
                        {l.reference || l.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">{l.broker_email ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {l.carrier_name ?? '—'}
                        {l.carrier_dot ? ` (${l.carrier_dot})` : ''}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {l.origin_label ?? '—'} → {l.destination_label ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(l.status)}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">{l.ping_count}</td>
                      <td
                        className={`px-4 py-2 text-xs font-semibold ${
                          l.flagged_pings > 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {l.flagged_pings}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{timeAgo(l.last_ping_at)}</td>
                      <td className="px-4 py-2 text-right">
                        <Link href={`/loads/${l.id}`} className="text-xs font-semibold text-blue-700 hover:underline">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data.loads.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs text-slate-500">
                        No loads yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Brokers</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {data.brokers.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-0"
                    >
                      <span className="truncate text-slate-700">{b.email ?? `${b.id.slice(0, 8)}…`}</span>
                      <span className="shrink-0 text-slate-500">
                        {b.active_count}/{b.active_track_quota} active · {b.load_count} loads
                      </span>
                    </li>
                  ))}
                  {data.brokers.length === 0 && <li className="text-slate-500">No brokers yet.</li>}
                </ul>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Activity</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {data.activity.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-0"
                    >
                      <span className="truncate text-slate-700">{ALERT_LABELS[a.kind] ?? a.kind}</span>
                      <span className="shrink-0 text-slate-500">
                        {a.broker_email ?? '—'} · {timeAgo(a.created_at)}
                      </span>
                    </li>
                  ))}
                  {data.activity.length === 0 && <li className="text-slate-500">No activity yet.</li>}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({ label, value, tone = 'text-slate-800' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${tone}`}>{value.toLocaleString()}</p>
    </div>
  );
}


