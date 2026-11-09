import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/admin';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface StatusCount {
  status: string;
  n: string;
}

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [brokers, statuses, pings, loads, brokerRows, activity, vehicles] = await Promise.all([
    query<{ n: string }>('SELECT count(*)::text AS n FROM brokers'),
    query<StatusCount>('SELECT status, count(*)::text AS n FROM loads GROUP BY status'),
    query<{ total: string; flagged: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE risk >= 2)::text AS flagged
         FROM pings WHERE received_at > now() - interval '24 hours'`
    ),
    query<Record<string, unknown>>(
      `SELECT l.id::text, l.reference, l.status, l.carrier_name, l.carrier_dot,
              l.origin->>'label' AS origin_label, l.destination->>'label' AS destination_label,
              l.created_at, l.delivered_at, b.email AS broker_email,
              p.last_ping_at, p.ping_count, p.flagged_pings
         FROM loads l
         JOIN brokers b ON b.id = l.broker_id
         LEFT JOIN LATERAL (
           SELECT max(recorded_at) AS last_ping_at,
                  count(*)::int AS ping_count,
                  count(*) FILTER (WHERE risk >= 2)::int AS flagged_pings
             FROM pings WHERE load_id = l.id
         ) p ON true
        ORDER BY l.created_at DESC
        LIMIT 100`
    ),
    query<Record<string, unknown>>(
      `SELECT b.id, b.email, b.plan, b.active_track_quota,
              count(l.id)::int AS load_count,
              count(l.id) FILTER (WHERE l.status = 'active')::int AS active_count,
              max(l.created_at) AS last_load_at
         FROM brokers b
         LEFT JOIN loads l ON l.broker_id = b.id
        GROUP BY b.id
        ORDER BY b.created_at DESC
        LIMIT 100`
    ),
    query<Record<string, unknown>>(
      `SELECT a.id::text, a.kind, a.created_at, a.read_at, a.payload,
              a.load_id::text, b.email AS broker_email, l.reference
         FROM alerts a
         LEFT JOIN brokers b ON b.id = a.broker_id
         LEFT JOIN loads l ON l.id = a.load_id
        ORDER BY a.created_at DESC
        LIMIT 30`
    ),
    query<Record<string, unknown>>(
      `SELECT l.id::text, l.reference, p.lat, p.lng, p.recorded_at
         FROM loads l
         JOIN LATERAL (
           SELECT lat, lng, recorded_at FROM pings
            WHERE load_id = l.id ORDER BY recorded_at DESC LIMIT 1
         ) p ON true
        WHERE l.status = 'active'
        ORDER BY p.recorded_at DESC
        LIMIT 200`
    ),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statuses) byStatus[row.status] = Number(row.n);

  return NextResponse.json({
    isAdmin: true,
    kpis: {
      brokers: Number(brokers[0]?.n ?? 0),
      loads: byStatus,
      totalLoads: Object.values(byStatus).reduce((a, b) => a + b, 0),
      pings24h: Number(pings[0]?.total ?? 0),
      flagged24h: Number(pings[0]?.flagged ?? 0),
      activeTracks: byStatus.active ?? 0,
    },
    loads,
    brokers: brokerRows,
    activity,
    vehicles,
  });
}
