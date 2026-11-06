import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { lookupCarrier } from '@/lib/fmcsa';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dot = new URL(req.url).searchParams.get('dot') || '';
  if (!dot) return NextResponse.json({ error: 'dot param required' }, { status: 400 });

  const carrier = await lookupCarrier(dot);
  if (!carrier) {
    return NextResponse.json({ error: 'No FMCSA census record for that DOT number' }, { status: 404 });
  }
  return NextResponse.json({ carrier });
}
