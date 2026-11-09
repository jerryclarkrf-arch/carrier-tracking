import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { resolveAddress, suggestAddresses } from '@/lib/geocode';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const resolve = (params.get('resolve') || '').trim();
  const q = (params.get('q') || '').trim();

  if (resolve) {
    const hit = await resolveAddress(resolve);
    if (!hit) return NextResponse.json({ error: 'Could not find that address' }, { status: 404 });
    return NextResponse.json({ hit });
  }

  if (q.length < 5) return NextResponse.json({ hits: [] });
  const hits = await suggestAddresses(q);
  return NextResponse.json({ hits });
}
