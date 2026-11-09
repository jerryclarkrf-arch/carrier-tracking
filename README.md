# Carrier Load Track

Browser-first load tracking for SMB brokers, with carrier vetting borrowed from
[Carrier Snapshot](https://carrier-snapshot.vercel.app).

- **Separate Neon project** for tracking data (`carrier-tracking`, `aws-us-east-2`).
- **Separate Vercel project**, standalone deployment.
- **Shared identity**: uses Carrier Snapshot's Neon Auth instance, so the same
  email/password works in both apps. Sessions are per-domain; a custom domain
  (`app.` + `track.`) is the upgrade path to a single shared session.

## Local development

```bash
npm install
npm run migrate      # applies db/migrations/*.sql to DATABASE_URL_UNPOOLED
npm run dev
```

`.env.local` needs:

| Variable | Source |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | this project (`neon env pull`) |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_JWKS_URL` | Carrier Snapshot's auth (`neon neon-auth status --project-id damp-dream-27897826`) |
| `NEON_AUTH_COOKIE_SECRET` | generated per app (`openssl rand -base64 32`) |
| `DOT_APP_TOKEN` | FMCSA Socrata app token |
| `CRON_SECRET` | generated per app |
| `ADMIN_EMAILS` | comma-separated allowlist for `/admin` (optional) |

## Health check

`GET /api/health` reports database reachability and which env vars are present.

## Schema

`db/migrations/001_tracking.sql` — brokers, loads, load_stops, tracking_tokens,
pings, documents, alerts, api_keys, webhook_endpoints, webhook_deliveries.
`db/migrations/002_geocode_routes_alerts.sql` — geocode_cache, route_cache, alert indexes.

## Ping integrity flags

Every incoming ping is scored 0–3 from heuristics that run at insert time
(`lib/risk.ts`). Flags are stored on the ping row (`risk`, `flags`) and summed
into a per-load reliability score (clean pings 75%, no signal gaps 25%, −10 if
late).

| Flag | Meaning |
| --- | --- |
| `teleport` / `implausible_speed` | implied speed above ~134 / ~100 mph between two pings |
| `low_accuracy` | reported GPS accuracy worse than 500 m (sev 1) or 2,000 m (sev 2) |
| `signal_gap` | more than 30 min between pings while the load is active |
| `ip_location_mismatch` | network location (Vercel `x-vercel-ip-*` headers) more than 300 km from the reported position |
| `device_change` | user agent changed mid-load |
| `stationary` | position unchanged for over 2 h (frozen GPS) |
| `future_timestamp` / `stale_timestamp` / `duplicate_timestamp` | implausible client clock |

**These are risk indicators, not proof.** The UI says so on every load
(`RISK_COPY`), and we never label a driver as "spoofing" — the flags exist to
prompt a human review (double-brokering, cargo-theft, and disputes).

## Geocoding

`/api/geocode` is the only address entry path (the create-load form uses
`components/AddressField.tsx`):

- `GET /api/geocode?q=…` — US type-ahead suggestions from Photon (OSM), ≥5 chars.
- `GET /api/geocode?resolve=…` — one address or ZIP → coordinates, via the US
  Census geocoder (authoritative street addresses), Zippopotam for bare ZIPs, and
  Photon as a fallback for house numbers.
- Results are cached in `geocode_cache` (normalised query → point), so repeat
  lookups never leave the database. No API keys, no per-lookup cost.
- Paste `lat, lng` into the field to skip geocoding entirely.

## Alerts

`lib/alerts.ts` writes an `alerts` row whenever a ping changes something
meaningful, straight from `/api/pings`:

| Kind | Trigger |
| --- | --- |
| `arrived_pickup` / `arrived_drop` | geofence entered for that stop |
| `load_delivered` | auto-delivery on the final drop |
| `ping_flagged` | ping risk score ≥ 2 |

Brokers see a bell count in the nav (`/api/me` → `unread`) and the full feed at
`/alerts`. Drivers get the same events back in the ping response as `events[]`,
which the driver page turns into a banner, a vibration and a spoken
"You have arrived".

## Master (admin) view

`/admin` is gated by an email allowlist:

```
ADMIN_EMAILS="you@example.com,ops@example.com"
```

`lib/admin.ts#currentAdmin()` reads the Neon Auth session and compares the email;
`/api/admin/overview` returns 403 for everyone else. The page shows KPIs, a live
map of every reporting vehicle, all loads (broker, carrier, lane, pings, flags),
brokers with quota usage, and the cross-broker activity feed. This view spans
broker boundaries — it is an operator tool, not a broker feature.

## Drive Mode

The driver page is also the navigation UI:

- `POST /api/route` (token-scoped, no login) routes from the last ping to the
  next open stop using OSRM, cached in `route_cache` for 30 min and throttled to
  one network fetch per load per minute.
- `lib/nav.ts` projects the vehicle onto the returned polyline (client-side), so
  the next manoeuvre and its distance are computed from the same route the map
  draws — no extra requests.
- Voice prompts at 800 m / 300 m / 80 m, once per step, with a mute toggle. The
  first utterance happens inside the Start button tap so iOS unlocks audio.
- Screen Wake Lock is acquired on Start and re-acquired on `visibilitychange`.
- Two consecutive pings more than 100 m off-route trigger a re-route.
- "Open in Google Maps" (keyless `maps/dir/?api=1&destination=…`) is the
  fallback when routing is unavailable or the driver prefers a native app.

**OSRM demo server is pilot-grade**: it is non-commercial use only, rate limited
and has no uptime guarantee. Swap `OSRM` in `lib/routing.ts` for a paid or
self-hosted router before charging for the product.

## Smoke test

```bash
npm run dev                                   # in one terminal
node --env-file=.env.local scripts/smoke-phase3.mjs
```

Creates a throwaway load + driver link, then exercises the full path: track
payload with coordinates, pickup geofence → alert, OSRM route to the next stop,
drop geofence → delivery, `route_cache` reuse, page renders and API auth gates.
The fixture is deleted at the end.

## Build order

1. Loads + stops + carrier snapshot
2. Driver link (`/d/<token>`) with geolocation pings, map, ETA, geofencing
3. Ping risk flags (physics, accuracy, signal gaps, IP mismatch)
4. Customer share links + photo/POD uploads
5. Active-track plan gating, API keys, webhooks
