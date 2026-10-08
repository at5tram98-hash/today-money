CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL,
  summary TEXT NOT NULL, preferences TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, synced_at INTEGER NOT NULL,
  last_test_at INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS deliveries (
  device_id TEXT NOT NULL, notice_key TEXT NOT NULL, status TEXT NOT NULL,
  claimed_at INTEGER NOT NULL, sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(device_id, notice_key)
);
CREATE INDEX IF NOT EXISTS delivery_cleanup ON deliveries(claimed_at);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, challenge TEXT NOT NULL,
  subscription TEXT NOT NULL, summary TEXT NOT NULL, preferences TEXT NOT NULL,
  expires_at INTEGER NOT NULL, sends INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS enrollment_limits (
  ip_hash TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL
);
