import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let db = false;
  let error: string | null = null;
  try {
    const rows = await query<Record<string, unknown>>('SELECT 1 AS ok');
    db = rows.length > 0;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const envs = ['DATABASE_URL', 'NEON_AUTH_BASE_URL', 'NEON_AUTH_JWKS_URL', 'DOT_APP_TOKEN', 'CRON_SECRET'].filter(
    (k) => !!process.env[k]
  );

  return NextResponse.json({
    project: 'carrier-tracking',
    db,
    envs,
    error,
    ts: new Date().toISOString(),
  });
}
