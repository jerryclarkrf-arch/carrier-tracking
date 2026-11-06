import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { ensureBroker } from '@/lib/brokers';
import { getLoad, getOrCreateDriverToken, getPings, getStops, setLoadStatus } from '@/lib/loads';
import { buildTracking } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const broker = await ensureBroker(session.user.id, session.user.email);
  const load = await getLoad(broker.id, id);
  if (!load) return NextResponse.json({ error: 'Load not found' }, { status: 404 });

  const [stops, pings, driverToken] = await Promise.all([
    getStops(load.id),
    getPings(load.id, 200),
    getOrCreateDriverToken(load.id),
  ]);

  return NextResponse.json({
    tracking: buildTracking(load, stops, pings),
    carrierSnapshot: load.carrier_snapshot,
    driverUrlPath: `/d/${driverToken}`,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: { status?: string };
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.status) return NextResponse.json({ error: 'status required' }, { status: 400 });

  const broker = await ensureBroker(session.user.id, session.user.email);
  const load = await setLoadStatus(broker.id, id, body.status);
  if (!load) return NextResponse.json({ error: 'Load not found or invalid status' }, { status: 404 });

  return NextResponse.json({ load });
}
