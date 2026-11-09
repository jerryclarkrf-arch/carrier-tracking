import { getPool, query } from '@/lib/db';
import { haversineM } from '@/lib/geo';
import type { CarrierSnapshot } from '@/lib/fmcsa';
import { newLinkToken } from '@/lib/tokens';

export interface Place {
  label?: string;
  lat?: number;
  lng?: number;
}

export interface LoadRow {
  id: string;
  broker_id: string;
  reference: string | null;
  status: string;
  carrier_dot: string | null;
  carrier_name: string | null;
  carrier_snapshot: CarrierSnapshot | null;
  origin: Place | null;
  destination: Place | null;
  pickup_at: string | null;
  deliver_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StopRow {
  id: string;
  seq: number;
  kind: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  arrived_at: string | null;
  departed_at: string | null;
}

export interface PingRow {
  id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  recorded_at: string;
  risk: number;
  flags: unknown[];
}

const LOAD_COLS = `id, broker_id, reference, status, carrier_dot, carrier_name, carrier_snapshot,
  origin, destination, pickup_at, deliver_at, delivered_at, created_at, updated_at`;

export async function listLoads(brokerId: string): Promise<LoadRow[]> {
  return query<LoadRow>(
    `SELECT ${LOAD_COLS} FROM loads WHERE broker_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [brokerId]
  );
}

export async function getLoad(brokerId: string, id: string): Promise<LoadRow | null> {
  const rows = await query<LoadRow>(`SELECT ${LOAD_COLS} FROM loads WHERE id = $1 AND broker_id = $2`, [
    id,
    brokerId,
  ]);
  return rows[0] ?? null;
}

export async function getStops(loadId: string): Promise<StopRow[]> {
  return query<StopRow>(
    `SELECT id, seq, kind, label, lat, lng, radius_m, arrived_at, departed_at
     FROM load_stops WHERE load_id = $1 ORDER BY seq`,
    [loadId]
  );
}

export async function getPings(loadId: string, limit = 200): Promise<PingRow[]> {
  return query<PingRow>(
    `SELECT id::text, lat, lng, accuracy_m, speed_mps, recorded_at, risk, flags
     FROM pings WHERE load_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
    [loadId, limit]
  );
}

export interface PingHistoryRow {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  recorded_at: string;
  user_agent: string | null;
}

/** Just enough history to run the integrity checks on an incoming ping. */
export async function getRecentPings(loadId: string, limit = 4): Promise<PingHistoryRow[]> {
  return query<PingHistoryRow>(
    `SELECT lat, lng, accuracy_m, recorded_at, user_agent
       FROM pings WHERE load_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
    [loadId, limit]
  );
}

export interface CreateLoadInput {
  brokerId: string;
  reference?: string | null;
  carrierDot?: string | null;
  carrierName?: string | null;
  carrierSnapshot?: CarrierSnapshot | null;
  origin: Place;
  destination: Place;
  pickupAt?: string | null;
  deliverAt?: string | null;
}

const hasCoords = (p?: Place | null) =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export async function createLoad(input: CreateLoadInput): Promise<LoadRow> {
  const active = hasCoords(input.origin) && hasCoords(input.destination);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<LoadRow>(
      `INSERT INTO loads
         (broker_id, reference, status, carrier_dot, carrier_name, carrier_snapshot,
          origin, destination, pickup_at, deliver_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${LOAD_COLS}`,
      [
        input.brokerId,
        input.reference ?? null,
        active ? 'active' : 'draft',
        input.carrierDot ?? null,
        input.carrierName ?? null,
        input.carrierSnapshot ? JSON.stringify(input.carrierSnapshot) : null,
        JSON.stringify(input.origin ?? {}),
        JSON.stringify(input.destination ?? {}),
        input.pickupAt ?? null,
        input.deliverAt ?? null,
      ]
    );
    const load = rows[0];

    const stops = [
      { seq: 1, kind: 'pickup', label: input.origin?.label ?? 'Pickup', place: input.origin },
      { seq: 2, kind: 'drop', label: input.destination?.label ?? 'Drop-off', place: input.destination },
    ];
    for (const s of stops) {
      await client.query(
        `INSERT INTO load_stops (load_id, seq, kind, label, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [load.id, s.seq, s.kind, s.label, s.place?.lat ?? null, s.place?.lng ?? null]
      );
    }

    await client.query('COMMIT');
    return load;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const ALLOWED_STATUS = new Set(['draft', 'active', 'delivered', 'cancelled']);

export async function setLoadStatus(
  brokerId: string,
  id: string,
  status: string
): Promise<LoadRow | null> {
  if (!ALLOWED_STATUS.has(status)) return null;
  const rows = await query<LoadRow>(
    `UPDATE loads
        SET status = $3,
            delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END,
            updated_at = now()
      WHERE id = $1 AND broker_id = $2
      RETURNING ${LOAD_COLS}`,
    [id, brokerId, status]
  );
  return rows[0] ?? null;
}

/** Reuses a live driver link when one exists, otherwise mints a 7-day token. */
export async function getOrCreateDriverToken(loadId: string): Promise<string> {
  const existing = await query<{ token: string }>(
    `SELECT token FROM tracking_tokens
      WHERE load_id = $1 AND kind = 'driver' AND revoked = false
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC LIMIT 1`,
    [loadId]
  );
  if (existing[0]) return existing[0].token;

  const token = newLinkToken();
  await query(
    `INSERT INTO tracking_tokens (load_id, kind, token, expires_at)
     VALUES ($1, 'driver', $2, now() + interval '7 days')`,
    [loadId, token]
  );
  return token;
}

export interface TokenContext {
  tokenId: string;
  kind: string;
  expiresAt: string | null;
  revoked: boolean;
  load: LoadRow;
}

export async function getTokenContext(token: string): Promise<TokenContext | null> {
  const rows = await query<LoadRow & {
    token_id: string;
    kind: string;
    expires_at: string | null;
    revoked: boolean;
  }>(
    `SELECT t.id AS token_id, t.kind, t.expires_at, t.revoked,
            ${LOAD_COLS.split(',').map((c) => `l.${c.trim()}`).join(', ')}
       FROM tracking_tokens t
       JOIN loads l ON l.id = t.load_id
      WHERE t.token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;
  const { token_id, kind, expires_at, revoked, ...load } = row;
  return {
    tokenId: token_id,
    kind,
    expiresAt: expires_at,
    revoked,
    load: load as unknown as LoadRow,
  };
}

/**
 * Marks stops arrived/departed from a fresh ping, and closes the load when the
 * final drop is reached. Returns the stop kinds that changed.
 */
export async function applyGeofence(
  load: LoadRow,
  at: { lat: number; lng: number },
  when: string
): Promise<string[]> {
  const stops = await getStops(load.id);
  const changed: string[] = [];

  for (const stop of stops) {
    if (stop.lat === null || stop.lng === null) continue;
    const distance = haversineM(at, { lat: stop.lat, lng: stop.lng });
    if (distance > stop.radius_m) continue;
    if (!stop.arrived_at) {
      await query('UPDATE load_stops SET arrived_at = $2 WHERE id = $1', [stop.id, when]);
      changed.push(stop.kind);
    }
  }

  const drop = stops.filter((s) => s.kind === 'drop').sort((a, b) => b.seq - a.seq)[0];
  if (drop && drop.lat !== null && drop.lng !== null && !load.delivered_at) {
    const distance = haversineM(at, { lat: drop.lat, lng: drop.lng });
    if (distance <= drop.radius_m) {
      await query(
        `UPDATE loads SET status = 'delivered', delivered_at = now(), updated_at = now()
          WHERE id = $1 AND status <> 'delivered'`,
        [load.id]
      );
      await query('UPDATE load_stops SET arrived_at = COALESCE(arrived_at, now()) WHERE id = $1', [
        drop.id,
      ]);
      changed.push('delivered');
    }
  }

  return changed;
}

