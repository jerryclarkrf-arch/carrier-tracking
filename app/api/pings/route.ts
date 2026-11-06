import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { applyGeofence, getTokenContext } from '@/lib/loads';
import { isWellFormedToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

interface PingBody {
  token?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  recordedAt?: string;
}

// Per-instance throttle: one accepted ping per token every 3s.
const lastAccepted = new Map<string, number>();
const MIN_INTERVAL_MS = 3000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clampTime = (iso: unknown): Date => {
  const now = Date.now();
  const parsed = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(parsed)) return new Date(now);
  if (parsed > now + 5 * 60_000) return new Date(now);
  if (parsed < now - 24 * 60 * 60_000) return new Date(now);
  return new Date(parsed);
};

export async function POST(req: NextRequest) {
  let body: PingBody;
  try {
    body = (await req.json()) as PingBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!isWellFormedToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });

  if (!finite(body.lat) || !finite(body.lng)) {
    return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 });
  }
  if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
    return NextResponse.json({ error: 'lat/lng out of range' }, { status: 400 });
  }

  const ctx = await getTokenContext(token);
  if (!ctx) return NextResponse.json({ error: 'Unknown tracking link' }, { status: 404 });
  if (ctx.revoked) return NextResponse.json({ error: 'This link was revoked' }, { status: 410 });
  if (ctx.expiresAt && new Date(ctx.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  }
  if (ctx.kind !== 'driver') {
    return NextResponse.json({ error: 'This link cannot post location' }, { status: 403 });
  }

  const throttleKey = ctx.tokenId;
  const last = lastAccepted.get(throttleKey) ?? 0;
  if (Date.now() - last < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: 'Too many pings', retryAfterMs: MIN_INTERVAL_MS - (Date.now() - last) },
      { status: 429 }
    );
  }
  lastAccepted.set(throttleKey, Date.now());

  const recordedAt = clampTime(body.recordedAt);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = req.headers.get('user-agent')?.slice(0, 300) ?? null;

  try {
    await query(
      `INSERT INTO pings (load_id, token_id, lat, lng, accuracy_m, heading, speed_mps, recorded_at, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ctx.load.id,
        ctx.tokenId,
        body.lat,
        body.lng,
        finite(body.accuracy) ? Math.min(100000, Math.max(0, body.accuracy)) : null,
        finite(body.heading) ? Math.min(360, Math.max(0, body.heading)) : null,
        finite(body.speed) ? Math.min(90, Math.max(0, body.speed)) : null,
        recordedAt.toISOString(),
        ip,
        ua,
      ]
    );

    if (ctx.load.status === 'draft') {
      await query(`UPDATE loads SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'draft'`, [
        ctx.load.id,
      ]);
    }

    const changed = await applyGeofence(ctx.load, { lat: body.lat, lng: body.lng }, recordedAt.toISOString());

    return NextResponse.json({ ok: true, receivedAt: new Date().toISOString(), events: changed });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not store ping', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
