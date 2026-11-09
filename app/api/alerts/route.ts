import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { listAlerts, markAlertsRead, unreadAlertCount } from '@/lib/alerts';
import { ensureBroker } from '@/lib/brokers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const broker = await ensureBroker(session.user.id, session.user.email);
  const [alerts, unread] = await Promise.all([listAlerts(broker.id, 50), unreadAlertCount(broker.id)]);
  return NextResponse.json({ alerts, unread });
}

export async function POST(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { ids?: string[] } = {};
  try {
    body = (await req.json()) as { ids?: string[] };
  } catch {
    body = {};
  }

  const broker = await ensureBroker(session.user.id, session.user.email);
  const updated = await markAlertsRead(
    broker.id,
    Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : undefined
  );
  const unread = await unreadAlertCount(broker.id);
  return NextResponse.json({ updated, unread });
}
