import { NextRequest, NextResponse } from 'next/server';
import { getPings, getStops, getTokenContext } from '@/lib/loads';
import { getRoute, routingAllowed } from '@/lib/routing';
import { isWellFormedToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

interface Body {
  token?: string;
  lat?: number;
  lng?: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!isWellFormedToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });

  const ctx = await getTokenContext(token);
  if (!ctx) return NextResponse.json({ error: 'Unknown tracking link' }, { status: 404 });
  if (ctx.revoked) return NextResponse.json({ error: 'This link was revoked' }, { status: 410 });
  if (ctx.expiresAt && new Date(ctx.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  }

  const stops = await getStops(ctx.load.id);
  const destination = stops.find((s) => s.lat !== null && s.lng !== null && !s.arrived_at);
  if (!destination || destination.lat === null || destination.lng === null) {
    return NextResponse.json({ destination: null, route: null, reason: 'no_open_stop' });
  }

  let origin = finite(body.lat) && finite(body.lng) ? { lat: body.lat, lng: body.lng } : null;
  if (!origin) {
    const pings = await getPings(ctx.load.id, 1);
    const latest = pings[0];
    if (!latest) return NextResponse.json({ destination, route: null, reason: 'no_ping_yet' });
    origin = { lat: latest.lat, lng: latest.lng };
  }

  const allowNetwork = routingAllowed(ctx.load.id, 60_000);
  const route = await getRoute(origin, { lat: destination.lat, lng: destination.lng }, allowNetwork);

  return NextResponse.json({
    destination: {
      seq: destination.seq,
      kind: destination.kind,
      label: destination.label,
      lat: destination.lat,
      lng: destination.lng,
    },
    route: route
      ? {
          distanceM: route.distanceM,
          durationS: route.durationS,
          geometry: route.geometry,
          steps: route.steps,
          cached: route.cached,
        }
      : null,
    reason: route ? null : allowNetwork ? 'routing_unavailable' : 'throttled',
  });
}
