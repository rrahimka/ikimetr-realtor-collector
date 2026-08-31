BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS discovery_candidates (
  candidate_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  strategy TEXT NOT NULL,
  seed TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  username TEXT,
  relevance_score REAL NOT NULL DEFAULT 0,
  relevance_reasons_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('DISCOVERED','QUEUED','VERIFIED','JOINED','ACTIVE','REJECTED','NEEDS_APPROVAL','COOLDOWN','BLOCKED','DEAD')),
  source_id INTEGER,
  joined_at TEXT,
  last_checked_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS discovery_candidates_status_idx ON discovery_candidates(status);
CREATE INDEX IF NOT EXISTS discovery_candidates_platform_idx ON discovery_candidates(platform);

PRAGMA user_version = 10;
COMMIT;
