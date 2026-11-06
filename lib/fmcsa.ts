// Minimal FMCSA census lookup, used to snapshot a carrier when a load is assigned.
// Kept tiny and dependency-free: one SODA query per assign, cached by the caller.
const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const STATUS: Record<string, string> = { A: 'Active', I: 'Inactive', P: 'Pending' };

export interface CarrierSnapshot {
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
  drivers: number | null;
  safetyRating: string | null;
  addedDate: string | null;
  source: 'fmcsa-census';
  fetchedAt: string;
}

const str = (r: Record<string, unknown>, k: string): string | null => {
  const v = r[k];
  return v === undefined || v === null || v === '' ? null : String(v);
};

const num = (r: Record<string, unknown>, k: string): number | null => {
  const n = Number(str(r, k));
  return Number.isFinite(n) ? n : null;
};

const fmtDate = (v: string | null): string | null => {
  if (!v) return null;
  const s = v.slice(0, 10).replace(/-/g, '');
  return s.length === 8 ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : v;
};

export function normalizeDot(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '');
}

export async function lookupCarrier(dotInput: string): Promise<CarrierSnapshot | null> {
  const dot = normalizeDot(dotInput);
  if (!dot) return null;

  try {
    const url = `${CENSUS}?$limit=1&$where=${encodeURIComponent(`dot_number='${dot}'`)}`;
    const res = await fetch(url, {
      headers: { 'X-App-Token': process.env.DOT_APP_TOKEN || '' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Record<string, unknown>[];
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) return null;

    const prefix = str(r, 'docket1prefix');
    const docketNumber = str(r, 'docket1');

    return {
      dot,
      legalName: str(r, 'legal_name'),
      dba: str(r, 'dba_name'),
      docket: prefix && docketNumber ? `${prefix}${docketNumber}` : docketNumber,
      dotStatus: STATUS[str(r, 'status_code')?.toUpperCase() ?? ''] ?? 'Unknown',
      authStatus: STATUS[str(r, 'docket1_status_code')?.toUpperCase() ?? ''] ?? 'Unknown',
      phone: str(r, 'phone'),
      city: str(r, 'phy_city'),
      state: str(r, 'phy_state'),
      powerUnits: num(r, 'power_units'),
      drivers: num(r, 'total_drivers'),
      safetyRating: str(r, 'safety_rating'),
      addedDate: fmtDate(str(r, 'add_date')),
      source: 'fmcsa-census',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
