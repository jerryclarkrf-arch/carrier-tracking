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

## Build order

1. Loads + stops + carrier snapshot
2. Driver link (`/d/<token>`) with geolocation pings, map, ETA, geofencing
3. Ping risk flags (physics, accuracy, signal gaps, IP mismatch)
4. Customer share links + photo/POD uploads
5. Active-track plan gating, API keys, webhooks
