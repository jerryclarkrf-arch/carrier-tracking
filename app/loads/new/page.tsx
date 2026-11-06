'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';

interface Carrier {
  dot: string;
  legalName: string | null;
  dba: string | null;
  docket: string | null;
  dotStatus: string;
  authStatus: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  powerUnits: number | null;
  safetyRating: string | null;
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

function parseCoords(value: string): { lat?: number; lng?: number } {
  const parts = value.split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return {};
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return {};
  return { lat, lng };
}

export default function NewLoadPage() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [dot, setDot] = useState('');
  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [originLabel, setOriginLabel] = useState('');
  const [originCoords, setOriginCoords] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [destCoords, setDestCoords] = useState('');
  const [pickupAt, setPickupAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function lookup() {
    const clean = dot.replace(/\D/g, '');
    if (!clean) {
      setLookupError('Enter a USDOT number first.');
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    setCarrier(null);
    try {
      const res = await fetch(`/api/carriers/lookup?dot=${clean}`);
      const json = await res.json();
      if (!res.ok) {
        setLookupError(json.error || 'Lookup failed');
        return;
      }
      setCarrier(json.carrier as Carrier);
    } catch {
      setLookupError('Lookup failed');
    } finally {
      setLookingUp(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This browser has no geolocation support.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOriginCoords(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        if (!originLabel) setOriginLabel('My current location');
      },
      () => setError('Could not read your location. Paste coordinates instead.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!originLabel.trim() || !destLabel.trim()) {
      setError('Origin and destination labels are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/loads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference: reference.trim() || undefined,
          carrierDot: dot.replace(/\D/g, '') || undefined,
          origin: { label: originLabel.trim(), ...parseCoords(originCoords) },
          destination: { label: destLabel.trim(), ...parseCoords(destCoords) },
          pickupAt: pickupAt ? new Date(pickupAt).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not create the load');
        return;
      }
      router.push(`/loads/${json.load.id}`);
    } catch {
      setError('Could not create the load');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">New load</h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign the carrier, set the lane, then share the driver link from the load page.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reference</label>
              <input
                className={inputCls}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. LD-1042"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pickup date/time</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={pickupAt}
                onChange={(e) => setPickupAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <label className="text-[11px] font-bold uppercase tracking-wide text-blue-800">Carrier (USDOT)</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputCls}
                value={dot}
                onChange={(e) => setDot(e.target.value)}
                placeholder="e.g. 4574788"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={lookup}
                disabled={lookingUp}
                className="rounded-xl border border-blue-300 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60"
              >
                {lookingUp ? 'Looking up…' : 'Look up'}
              </button>
            </div>
            {lookupError && <p className="text-xs text-rose-700">{lookupError}</p>}
            {carrier && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <p className="text-sm font-semibold text-slate-900">{carrier.legalName ?? 'Unknown carrier'}</p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>DOT {carrier.dot}</span>
                  {carrier.docket && <span>MC {carrier.docket}</span>}
                  <span>DOT status: {carrier.dotStatus}</span>
                  <span>Authority: {carrier.authStatus}</span>
                  {carrier.powerUnits !== null && <span>Power units: {carrier.powerUnits}</span>}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Snapshot stored with the load at creation time.</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Origin label</label>
              <input
                className={inputCls}
                value={originLabel}
                onChange={(e) => setOriginLabel(e.target.value)}
                placeholder="e.g. Atlanta, GA"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Origin coordinates</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={originCoords}
                  onChange={(e) => setOriginCoords(e.target.value)}
                  placeholder="33.7490, -84.3880"
                />
                <button
                  type="button"
                  onClick={useMyLocation}
                  className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Use mine
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Destination label</label>
              <input
                className={inputCls}
                value={destLabel}
                onChange={(e) => setDestLabel(e.target.value)}
                placeholder="e.g. Dallas, TX"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Destination coordinates</label>
              <input
                className={inputCls}
                value={destCoords}
                onChange={(e) => setDestCoords(e.target.value)}
                placeholder="32.7767, -96.7970"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Coordinates are what make live tracking work. Paste them as <span className="font-mono">lat, lng</span>{' '}
            (Google Maps: right-click → copy coordinates). Without both pairs the load is saved as a draft.
          </p>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create load'}
            </button>
            <Link href="/loads" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}


