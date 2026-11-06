import { query } from '@/lib/db';

export interface Broker {
  id: string;
  email: string | null;
  company: string | null;
  plan: string;
  active_track_quota: number;
}

/** Creates the broker row on first use; identity itself lives in Neon Auth. */
export async function ensureBroker(userId: string, email?: string | null): Promise<Broker> {
  const rows = await query<Broker>(
    `INSERT INTO brokers (id, email)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, brokers.email)
     RETURNING id, email, company, plan, active_track_quota`,
    [userId, email ?? null]
  );
  return rows[0];
}

export async function getBroker(userId: string): Promise<Broker | null> {
  const rows = await query<Broker>(
    'SELECT id, email, company, plan, active_track_quota FROM brokers WHERE id = $1',
    [userId]
  );
  return rows[0] ?? null;
}

/** How many loads are currently being tracked against the plan quota. */
export async function activeTrackCount(userId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM loads WHERE broker_id = $1 AND status = 'active'`,
    [userId]
  );
  return Number(rows[0]?.n ?? 0);
}
