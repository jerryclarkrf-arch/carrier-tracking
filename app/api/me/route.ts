import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { isAdminEmail } from '@/lib/admin';
import { unreadAlertCount } from '@/lib/alerts';
import { activeTrackCount, getBroker } from '@/lib/brokers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const broker = await getBroker(session.user.id);
  const [used, unread] = await Promise.all([
    broker ? activeTrackCount(broker.id) : Promise.resolve(0),
    broker ? unreadAlertCount(broker.id) : Promise.resolve(0),
  ]);

  return NextResponse.json({
    user: { id: session.user.id, email: session.user.email ?? null, name: session.user.name ?? null },
    isAdmin: isAdminEmail(session.user.email),
    unread,
    broker: broker ? { plan: broker.plan, limit: broker.active_track_quota, used } : null,
  });
}
