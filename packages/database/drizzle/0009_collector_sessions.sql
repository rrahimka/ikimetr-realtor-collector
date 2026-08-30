BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS collector_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'stopping', 'stopped', 'error')),
  started_at TEXT,
  started_by TEXT,
  last_heartbeat_at TEXT,
  stopped_at TEXT,
  stop_reason TEXT,
  active_sources_json TEXT NOT NULL DEFAULT '[]',
  counters_json TEXT NOT NULL DEFAULT '{}',
  error TEXT
);

CREATE INDEX IF NOT EXISTS collector_sessions_status_idx ON collector_sessions(status);

ALTER TABLE runs ADD COLUMN session_id INTEGER REFERENCES collector_sessions(id);
ALTER TABLE runs ADD COLUMN new_contacts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN duplicates INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 9;
COMMIT;
