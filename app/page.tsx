'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { authClient } from '@/lib/auth/client';

interface Health {
  project: string;
  db: boolean;
  envs: string[];
  error: string | null;
}

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL || 'https://carrier-snapshot.vercel.app';

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: Health) => {
        if (!cancelled) setHealth(j);
      })
      .catch(() => {
        if (!cancelled) setHealth({ project: 'carrier-tracking', db: false, envs: [], error: 'unreachable' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const identityOk = !isPending && !!session?.user;
  const checks = [
    {
      label: 'Shared identity',
      ok: identityOk,
      detail: isPending ? 'checking…' : session?.user?.email || 'not signed in',
      hint: 'Same Neon Auth instance as Carrier Snapshot',
    },
    {
      label: 'Tracking database',
      ok: !!health?.db,
      detail: health ? (health.db ? 'connected to project B' : health.error || 'not reachable') : 'checking…',
      hint: 'Separate Neon project (this app owns it)',
    },
    {
      label: 'FMCSA token',
      ok: !!health?.envs?.includes('DOT_APP_TOKEN'),
      detail: health?.envs?.includes('DOT_APP_TOKEN') ? 'present' : 'missing',
      hint: 'Reused for carrier lookups',
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50 px-6 py-8 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Phase 1 · live tracking
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Load Tracking</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            Browser-first load visibility for SMB brokers: the driver opens a link, location pings stream in, and every
            ping is checked for plausibility. Carrier vetting comes from{' '}
            <a
              href={SNAPSHOT_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-blue-700 hover:underline"
            >
              Carrier Snapshot
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/loads"
              className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Open loads
            </Link>
            <Link
              href="/loads/new"
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Create a load
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {checks.map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
                <span className={`h-2 w-2 rounded-full ${c.ok ? 'bg-emerald-500' : 'bg-amber-400'}`} aria-hidden />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800 break-words">{c.detail}</p>
              <p className="mt-1 text-[11px] text-slate-400">{c.hint}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">Build order</h2>
          <ol className="mt-3 space-y-2 text-sm text-slate-600">
            <li>1 · Loads, stops and the carrier snapshot captured at assign time</li>
            <li>2 · Driver link (browser) with geolocation pings, map and ETA</li>
            <li>3 · Ping risk flags — physics, accuracy, signal gaps, IP mismatch</li>
            <li>4 · Customer share links and photo / POD uploads</li>
            <li>5 · Active-track plan gating, API keys and webhooks</li>
          </ol>
          {!identityOk && (
            <p className="mt-4 text-xs text-slate-500">
              <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">
                Sign in
              </Link>{' '}
              with your Carrier Snapshot account — identity is shared.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
