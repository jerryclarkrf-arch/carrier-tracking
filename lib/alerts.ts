import { query } from '@/lib/db';
import type { AlertKind } from '@/lib/alert-labels';

export interface AlertRow {
  id: string;
  broker_id: string;
  load_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

export async function recordAlert(input: {
  brokerId: string;
  loadId?: string | null;
  kind: AlertKind;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO alerts (broker_id, load_id, kind, payload) VALUES ($1,$2,$3,$4::jsonb)`,
      [input.brokerId, input.loadId ?? null, input.kind, JSON.stringify(input.payload ?? {})]
    );
  } catch {
    // alerts must never break the ping path
  }
}

export async function listAlerts(brokerId: string, limit = 50): Promise<AlertRow[]> {
  return query<AlertRow>(
    `SELECT id::text, broker_id, load_id, kind, payload, created_at, read_at
       FROM alerts WHERE broker_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [brokerId, limit]
  );
}

export async function unreadAlertCount(brokerId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    'SELECT count(*)::text AS n FROM alerts WHERE broker_id = $1 AND read_at IS NULL',
    [brokerId]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function markAlertsRead(brokerId: string, ids?: string[]): Promise<number> {
  if (ids && ids.length > 0) {
    const rows = await query<{ id: string }>(
      `UPDATE alerts SET read_at = now()
        WHERE broker_id = $1 AND read_at IS NULL AND id = ANY($2::uuid[])
        RETURNING id::text`,
      [brokerId, ids]
    );
    return rows.length;
  }
  const rows = await query<{ id: string }>(
    `UPDATE alerts SET read_at = now() WHERE broker_id = $1 AND read_at IS NULL RETURNING id::text`,
    [brokerId]
  );
  return rows.length;
}

export const ALERT_LABELS: Record<string, string> = {
  arrived_pickup: 'Arrived at pickup',
  arrived_drop: 'Arrived at drop-off',
  load_delivered: 'Load delivered',
  ping_flagged: 'Ping flagged',
  load_created: 'Load created',
};
