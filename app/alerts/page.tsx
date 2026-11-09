'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { ALERT_LABELS } from '@/lib/alert-labels';

interface AlertRow {
  id: string;
  load_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

const tone = (kind: string) => {
  if (kind === 'load_delivered') return 'bg-emerald-100 text-emerald-800';
  if (kind === 'ping_flagged') return 'bg-rose-100 text-rose-800';
  if (kind === 'arrived_pickup' || kind === 'arrived_drop') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-600';
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/alerts')
      .then(async (r) => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error || 'Could not load alerts');
          return;
        }
        setAlerts(j.alerts as AlertRow[]);
        setUnread(Number(j.unread) || 0);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load alerts');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function markAll() {
    await fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    setAlerts((prev) => (prev ? prev.map((a) => ({ ...a, read_at: a.read_at ?? new Date().toISOString() })) : prev));
    setUnread(0);
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Alerts</h1>
            <p className="mt-1 text-sm text-slate-500">
              Arrivals, deliveries and flagged pings across your loads.
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markAll()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Mark all read ({unread})
            </button>
          )}
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {!alerts && !error && (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse" />
            ))}
          </div>
        )}

        {alerts && alerts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            Nothing yet. Arrivals and deliveries will appear here as the driver pings.
          </div>
        )}

        {alerts && alerts.length > 0 && (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${
                  alert.read_at ? '' : 'ring-1 ring-blue-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone(alert.kind)}`}>
                    {ALERT_LABELS[alert.kind] ?? alert.kind}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(alert.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {alert.payload && typeof alert.payload.flags === 'object' && Array.isArray(alert.payload.flags) && (
                    <span className="text-[11px] text-rose-700">
                      {(alert.payload.flags as string[]).join(', ')}
                    </span>
                  )}
                </div>
                {alert.load_id && (
                  <Link href={`/loads/${alert.load_id}`} className="text-xs font-semibold text-blue-700 hover:underline">
                    Open load →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
