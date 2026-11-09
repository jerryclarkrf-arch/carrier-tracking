-- Phase 3 support: geocoding cache, route cache, alert indexes.

CREATE TABLE IF NOT EXISTS geocode_cache (
  query_key  TEXT PRIMARY KEY,          -- normalised query string
  label      TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  source     TEXT,                      -- census | photon | zip
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_cache (
  route_key  TEXT PRIMARY KEY,          -- rounded origin->destination
  distance_m DOUBLE PRECISION,
  duration_s DOUBLE PRECISION,
  geometry   JSONB,                     -- [[lng,lat], ...]
  steps      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_load_time ON alerts (load_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts (broker_id, read_at);
