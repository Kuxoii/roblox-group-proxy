Exit code: 0
Wall time: 0.6 seconds
Output:
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS deliveries_status
ON deliveries(status);

