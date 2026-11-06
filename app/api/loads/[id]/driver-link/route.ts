import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { ensureBroker } from '@/lib/brokers';
import { getLoad, getOrCreateDriverToken } from '@/lib/loads';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const broker = await ensureBroker(session.user.id, session.user.email);
  const load = await getLoad(broker.id, id);
  if (!load) return NextResponse.json({ error: 'Load not found' }, { status: 404 });

  const token = await getOrCreateDriverToken(load.id);
  const origin = new URL(req.url).origin;

  return NextResponse.json({ token, url: `${origin}/d/${token}` });
}
