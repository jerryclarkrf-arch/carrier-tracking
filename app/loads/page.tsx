'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

interface LoadSummary {
  id: string;
  reference: string | null;
  status: string;
  carrier_name: string | null;
  origin: { label?: string } | null;
  destination: { label?: string } | null;
  created_at: string;
}

interface ListPayload {
  loads: LoadSummary[];
  quota: { plan: string; limit: number; used: number };
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

export default function LoadsPage() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/loads')
      .then(async (r) => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error || 'Could not load loads');
          return;
        }
        setData(j as ListPayload);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load loads');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Loads</h1>
            <p className="text-sm text-slate-500 mt-1">Track assigned loads with a browser link — no driver app.</p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                {data.quota.used} / {data.quota.limit} active · {data.quota.plan}
              </span>
            )}
            <Link
              href="/loads/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              New load
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {!data && !error && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="h-3 w-1/3 rounded bg-slate-200 animate-pulse" />
                <div className="mt-3 h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {data && data.loads.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No loads yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Create a load, assign the carrier, and send the driver their tracking link.
            </p>
            <Link
              href="/loads/new"
              className="mt-4 inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Create the first load
            </Link>
          </div>
        )}

        {data && data.loads.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Carrier</th>
                  <th className="px-4 py-3 text-left">Lane</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.loads.map((load) => (
                  <tr key={load.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {load.reference || load.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">{load.carrier_name || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {load.origin?.label || '—'} <span className="text-slate-400">→</span>{' '}
                      {load.destination?.label || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge(load.status)}`}>
                        {load.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(load.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/loads/${load.id}`} className="text-xs font-semibold text-blue-700 hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

