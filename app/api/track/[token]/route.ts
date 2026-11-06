import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getPings, getStops, getTokenContext } from '@/lib/loads';
import { buildTracking } from '@/lib/tracking';
import { isWellFormedToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  if (!isWellFormedToken(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });

  const ctx = await getTokenContext(token);
  if (!ctx) return NextResponse.json({ error: 'Unknown tracking link' }, { status: 404 });
  if (ctx.revoked) return NextResponse.json({ error: 'This link was revoked' }, { status: 410 });
  if (ctx.expiresAt && new Date(ctx.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  }

  const [stops, pings] = await Promise.all([getStops(ctx.load.id), getPings(ctx.load.id, 100)]);

  if (ctx.kind === 'view') {
    await query('UPDATE tracking_tokens SET views = views + 1, last_view_at = now() WHERE id = $1', [
      ctx.tokenId,
    ]);
  }

  return NextResponse.json({ kind: ctx.kind, ...buildTracking(ctx.load, stops, pings) });
}
