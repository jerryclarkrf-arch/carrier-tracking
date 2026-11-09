// Phase 3 smoke test: creates a throwaway load + driver link, exercises the
// public driver endpoints (track, pings -> alerts, route) and deletes it again.
//
// Usage:
//   npm run dev            (in another terminal)
//   node --env-file=.env.local scripts/smoke-phase3.mjs

import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required.');
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const ORIGIN = { lat: 33.749, lng: -84.388 }; // Atlanta
const DROP = { lat: 32.7767, lng: -96.797 }; // Dallas

const broker = (await client.query('SELECT id FROM brokers ORDER BY created_at LIMIT 1')).rows[0];
if (!broker) {
  console.error('No broker rows — sign in once first.');
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
const { rows: loadRows } = await client.query(
  `INSERT INTO loads (broker_id, reference, status, origin, destination)
   VALUES ($1, $2, 'active', $3::jsonb, $4::jsonb) RETURNING id`,
  [broker.id, 'SMOKE-PHASE3', JSON.stringify(ORIGIN), JSON.stringify(DROP)]
);
const loadId = loadRows[0].id;

await client.query(
  `INSERT INTO load_stops (load_id, seq, kind, label, lat, lng, radius_m)
   VALUES ($1, 1, 'pickup', 'Smoke pickup', $2, $3, 800),
          ($1, 2, 'drop',   'Smoke drop',   $4, $5, 800)`,
  [loadId, ORIGIN.lat, ORIGIN.lng, DROP.lat, DROP.lng]
);
await client.query(
  `INSERT INTO tracking_tokens (load_id, kind, token, expires_at)
   VALUES ($1, 'driver', $2, now() + interval '1 day')`,
  [loadId, token]
);

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  // 1. Customer/driver view payload
  const trackRes = await fetch(`${BASE}/api/track/${token}`);
  const track = await trackRes.json();
  check('GET /api/track/:token', trackRes.status === 200 && Array.isArray(track.stops), `status ${trackRes.status}`);
  check('track payload carries stop coordinates', Boolean(track.stops?.[0]?.lat), `lat=${track.stops?.[0]?.lat}`);

  // 2. Arrival at pickup fires an alert (and advances the open stop)
  const ping1 = await post('/api/pings', { token, lat: ORIGIN.lat, lng: ORIGIN.lng, accuracy: 12 });
  check(
    'ping inside pickup geofence emits pickup event',
    ping1.status === 200 && Array.isArray(ping1.json.events) && ping1.json.events.includes('pickup'),
    `${ping1.status} ${JSON.stringify(ping1.json.events ?? ping1.json)}`
  );

  await sleep(3200);

  // 3. Route to the next open stop (now the drop: Atlanta -> Dallas)
  const route = await post('/api/route', { token, lat: ORIGIN.lat, lng: ORIGIN.lng });
  const routeData = route.json?.route;
  check(
    'POST /api/route returns a real OSRM route',
    route.status === 200 && Array.isArray(routeData?.geometry) && routeData.geometry.length > 50,
    `${route.status} · ${
      routeData
        ? `${Math.round(routeData.distanceM / 1000)} km / ${Math.round(routeData.durationS / 3600)} h / ${routeData.steps.length} steps`
        : route.json?.reason
    }`
  );
  check(
    'route destination is the drop stop',
    route.json?.destination?.kind === 'drop',
    `${route.json?.destination?.kind ?? 'none'} · ${route.json?.destination?.label ?? ''}`
  );
  check(
    'route steps carry maneuver data',
    Array.isArray(routeData?.steps) && routeData.steps.some((s) => s.type === 'depart' && s.location?.length === 2),
    routeData?.steps?.[0]?.type
  );

  await sleep(3200);

  // 4. Arrival at drop + auto-delivery
  const ping2 = await post('/api/pings', { token, lat: DROP.lat, lng: DROP.lng, accuracy: 10 });
  check(
    'ping inside drop geofence emits drop + delivered',
    ping2.status === 200 &&
      Array.isArray(ping2.json.events) &&
      ping2.json.events.includes('drop') &&
      ping2.json.events.includes('delivered'),
    `${ping2.status} ${JSON.stringify(ping2.json.events ?? ping2.json)}`
  );

  // 5. Alerts were persisted for the broker
  const { rows: alerts } = await client.query(
    'SELECT kind FROM alerts WHERE load_id = $1 ORDER BY created_at',
    [loadId]
  );
  const kinds = alerts.map((a) => a.kind);
  check(
    'alerts rows written for arrival + delivery',
    kinds.includes('arrived_pickup') && kinds.includes('arrived_drop') && kinds.includes('load_delivered'),
    kinds.join(', ')
  );

  // 6. Route cache was used on the second call
  const { rows: cachedRoutes } = await client.query('SELECT count(*)::int AS n FROM route_cache');
  check('route_cache populated', cachedRoutes[0].n > 0, `${cachedRoutes[0].n} rows`);

  // 7. Pages render
  for (const path of [`/d/${token}`, '/admin', '/alerts']) {
    const res = await fetch(`${BASE}${path}`);
    check(`GET ${path}`, res.status === 200, `status ${res.status}`);
  }

  // 8. Auth gates hold
  const gated = [
    ['/api/alerts', 401],
    ['/api/admin/overview', 403],
    ['/api/geocode?q=505+NW+9th+Ave', 401],
    ['/api/me', 401],
  ];
  for (const [path, expected] of gated) {
    const res = await fetch(`${BASE}${path}`);
    check(`GET ${path} is gated`, res.status === expected, `status ${res.status} (expected ${expected})`);
  }
} finally {
  await client.query('DELETE FROM loads WHERE id = $1', [loadId]);
  await client.end();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed === 0 ? 0 : 1);
}
