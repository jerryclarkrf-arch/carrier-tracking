import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { activeTrackCount, ensureBroker } from '@/lib/brokers';
import { lookupCarrier } from '@/lib/fmcsa';
import { createLoad, listLoads, type Place } from '@/lib/loads';

export const dynamic = 'force-dynamic';

interface CreateBody {
  reference?: string;
  carrierDot?: string;
  carrierName?: string;
  origin?: Place;
  destination?: Place;
  pickupAt?: string;
  deliverAt?: string;
}

const cleanPlace = (p?: Place): Place => ({
  label: (p?.label || '').toString().trim().slice(0, 200) || undefined,
  lat: Number.isFinite(p?.lat) ? Number(p?.lat) : undefined,
  lng: Number.isFinite(p?.lng) ? Number(p?.lng) : undefined,
});

const hasCoords = (p: Place) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const broker = await ensureBroker(session.user.id, session.user.email);
  const [loads, used] = await Promise.all([listLoads(broker.id), activeTrackCount(broker.id)]);

  return NextResponse.json({
    loads,
    quota: { plan: broker.plan, limit: broker.active_track_quota, used },
  });
}

export async function POST(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const origin = cleanPlace(body.origin);
  const destination = cleanPlace(body.destination);
  if (!origin.label || !destination.label) {
    return NextResponse.json({ error: 'Origin and destination labels are required' }, { status: 400 });
  }

  const broker = await ensureBroker(session.user.id, session.user.email);
  const willBeActive = hasCoords(origin) && hasCoords(destination);

  if (willBeActive) {
    const used = await activeTrackCount(broker.id);
    if (used >= broker.active_track_quota) {
      return NextResponse.json(
        {
          error: `Plan limit reached: ${broker.active_track_quota} active track${
            broker.active_track_quota === 1 ? '' : 's'
          } on the ${broker.plan} plan. Deliver or cancel a load first.`,
          quota: { plan: broker.plan, limit: broker.active_track_quota, used },
        },
        { status: 402 }
      );
    }
  }

  const dot = (body.carrierDot || '').replace(/\D/g, '').replace(/^0+/, '');
  const carrier = dot ? await lookupCarrier(dot) : null;

  const load = await createLoad({
    brokerId: broker.id,
    reference: body.reference?.trim() || null,
    carrierDot: dot || null,
    carrierName: carrier?.legalName ?? body.carrierName?.trim() ?? null,
    carrierSnapshot: carrier,
    origin,
    destination,
    pickupAt: body.pickupAt || null,
    deliverAt: body.deliverAt || null,
  });

  return NextResponse.json({ load }, { status: 201 });
}
