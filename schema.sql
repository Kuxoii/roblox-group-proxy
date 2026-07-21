CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS deliveries_status
ON deliveries(status);

CREATE TABLE IF NOT EXISTS world_records (
  record_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  achieved_at INTEGER NOT NULL
);

