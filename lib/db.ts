import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const p = new Pool({ connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED });
    attachDatabasePool(p);
    pool = p;
  }
  return pool;
}

export async function query<T extends object = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const { rows } = await getPool().query(text, values);
  return rows as T[];
}

export function closePool(): Promise<void> {
  if (!pool) return Promise.resolve();
  const p = pool;
  pool = null;
  return p.end();
}