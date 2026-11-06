-- Carrier Load Track — core schema (separate Neon project from Carrier Snapshot).
-- `brokers.id` is the shared Neon Auth user id (identity lives in project A);
-- the reference is logical only because the two databases are independent.

CREATE TABLE IF NOT EXISTS brokers (
  id                 TEXT PRIMARY KEY,
  email              TEXT,
  company            TEXT,
  plan               TEXT NOT NULL DEFAULT 'free',  -- free | starter | base | pro
  active_track_quota INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id        TEXT NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  reference        TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',   -- draft | active | delivered | cancelled
  carrier_dot      TEXT,
  carrier_name     TEXT,
  carrier_snapshot JSONB,                           -- vetting captured at assign time
  origin           JSONB,                           -- { label, lat, lng }
  destination      JSONB,
  pickup_at        TIMESTAMPTZ,
  deliver_at       TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loads_broker_status ON loads (broker_id, status);
CREATE INDEX IF NOT EXISTS idx_loads_carrier ON loads (carrier_dot);

CREATE TABLE IF NOT EXISTS load_stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id     UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL,                        -- pickup | drop | stop
  label       TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  radius_m    INTEGER NOT NULL DEFAULT 800,
  arrived_at  TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  UNIQUE (load_id, seq)
);

CREATE TABLE IF NOT EXISTS tracking_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id      UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                       -- driver | view
  token        TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ,
  revoked      BOOLEAN NOT NULL DEFAULT false,
  views        INTEGER NOT NULL DEFAULT 0,
  last_view_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_load ON tracking_tokens (load_id, kind);

CREATE TABLE IF NOT EXISTS pings (
  id          BIGSERIAL PRIMARY KEY,
  load_id     UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  token_id    UUID REFERENCES tracking_tokens(id) ON DELETE SET NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy_m  DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  speed_mps   DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip          TEXT,
  user_agent  TEXT,
  risk        SMALLINT NOT NULL DEFAULT 0,          -- 0 clean .. 3 high
  flags       JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pings_load_time ON pings (load_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id     UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                        -- bol | pod | plate | seal | reefer | other
  storage_key TEXT NOT NULL,
  mime        TEXT,
  bytes       BIGINT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  captured_at TIMESTAMPTZ,
  uploaded_by TEXT,                                 -- driver | broker
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_load ON documents (load_id);

CREATE TABLE IF NOT EXISTS alerts (
  id         BIGSERIAL PRIMARY KEY,
  broker_id  TEXT NOT NULL,
  load_id    UUID REFERENCES loads(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alerts_broker_time ON alerts (broker_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id    TEXT NOT NULL,
  name         TEXT,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id  TEXT NOT NULL,
  url        TEXT NOT NULL,
  secret     TEXT NOT NULL,
  events     TEXT[] NOT NULL DEFAULT ARRAY['load.created','load.delivered','ping.flagged'],
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_status     INTEGER,
  next_attempt_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due ON webhook_deliveries (next_attempt_at);
