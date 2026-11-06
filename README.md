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

## Health check

`GET /api/health` reports database reachability and which env vars are present.

## Schema

`db/migrations/001_tracking.sql` — brokers, loads, load_stops, tracking_tokens,
pings, documents, alerts, api_keys, webhook_endpoints, webhook_deliveries.

## Build order

1. Loads + stops + carrier snapshot
2. Driver link (`/d/<token>`) with geolocation pings, map, ETA, geofencing
3. Ping risk flags (physics, accuracy, signal gaps, IP mismatch)
4. Customer share links + photo/POD uploads
5. Active-track plan gating, API keys, webhooks
