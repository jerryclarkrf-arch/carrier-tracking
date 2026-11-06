// Run SQL migrations in db/migrations/*.sql against the DIRECT (unpooled)
// connection, in filename order.
//
// Usage:
//   node --env-file=.env.local scripts/migrate.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Client } from 'pg';

const DIR = resolve('db/migrations');
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required.');
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.log('No migrations found in db/migrations.');
  process.exit(0);
}

const client = new Client({ connectionString: url });
await client.connect();

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  await client.query(sql);
  console.log(`applied ${file}`);
}

await client.end();
console.log('All migrations applied.');