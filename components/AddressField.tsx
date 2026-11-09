'use client';

import { useEffect, useRef, useState } from 'react';

export interface AddressValue {
  label: string;
  lat?: number;
  lng?: number;
}

interface Hit {
  label: string;
  lat: number;
  lng: number;
  source: string;
}

const COORDS = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/;

export default function AddressField({
  label,
  value,
  onChange,
  placeholder,
  extraAction,
}: {
  label: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  placeholder?: string;
  extraAction?: React.ReactNode;
}) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function handleChange(next: string) {
    onChange({ label: next });
    setOpen(true);
    setNotice(null);

    if (timer.current) clearTimeout(timer.current);
    if (next.trim().length < 5 || COORDS.test(next)) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(next)}`);
        const json = await res.json();
        setHits(Array.isArray(json.hits) ? (json.hits as Hit[]) : []);
      } catch {
        setHits([]);
      }
    }, 400);
  }

  function pick(hit: Hit) {
    onChange({ label: hit.label, lat: hit.lat, lng: hit.lng });
    setOpen(false);
    setHits([]);
    setNotice(null);
  }

  async function resolve(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setNotice(null);

    if (COORDS.test(trimmed)) {
      const [lat, lng] = trimmed.split(',').map((p) => Number.parseFloat(p.trim()));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        onChange({ label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?resolve=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (!res.ok || !json.hit) {
        setNotice(json.error || 'Address not found — paste coordinates instead.');
        return;
      }
      pick(json.hit as Hit);
    } catch {
      setNotice('Address lookup failed.');
    } finally {
      setBusy(false);
    }
  }

  const resolved = Number.isFinite(value.lat) && Number.isFinite(value.lng);

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={value.label}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void resolve(value.label);
              }
            }}
            placeholder={placeholder ?? 'Street, city, state or ZIP'}
            autoComplete="off"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          {open && hits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {hits.map((hit, index) => (
                <li key={`${hit.label}-${index}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(hit)}
                    className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-blue-50"
                  >
                    {hit.label}
                    <span className="ml-1 text-[10px] uppercase text-slate-400">{hit.source}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {extraAction}
        <button
          type="button"
          onClick={() => void resolve(value.label)}
          disabled={busy}
          className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? '…' : 'Find'}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        {resolved ? (
          <>
            Coordinates: <span className="font-mono">{value.lat?.toFixed(5)}, {value.lng?.toFixed(5)}</span>
          </>
        ) : notice ? (
          <span className="text-rose-600">{notice}</span>
        ) : (
          'Pick a suggestion, press Enter, or paste lat, lng.'
        )}
      </p>
    </div>
  );
}
