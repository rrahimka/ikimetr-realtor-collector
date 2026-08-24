PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
  locator TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'mixed', max_pages INTEGER NOT NULL DEFAULT 10,
  max_depth INTEGER NOT NULL DEFAULT 1, delay_ms INTEGER NOT NULL DEFAULT 1000,
  enabled INTEGER NOT NULL DEFAULT 1, kill_switch INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL UNIQUE, language TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','blocked')),
  started_at TEXT, finished_at TEXT, pages_checked INTEGER NOT NULL DEFAULT 0,
  phones_found INTEGER NOT NULL DEFAULT 0, unique_phones INTEGER NOT NULL DEFAULT 0,
  error TEXT, cancellation_requested INTEGER NOT NULL DEFAULT 0, needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_run_per_source ON runs(source_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, normalized_phone TEXT NOT NULL UNIQUE, original_phone TEXT NOT NULL,
  is_foreign INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL, name TEXT, agency TEXT, username TEXT,
  platform TEXT, confidence REAL NOT NULL, reasons_json TEXT NOT NULL, rule_version TEXT NOT NULL,
  classified_at TEXT NOT NULL, verification_status TEXT NOT NULL DEFAULT 'unreviewed',
  merged_into_id INTEGER REFERENCES contacts(id), first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER NOT NULL REFERENCES contacts(id),
  source_id INTEGER NOT NULL REFERENCES sources(id), source_url TEXT NOT NULL, location_type TEXT NOT NULL,
  excerpt TEXT NOT NULL, raw_phone TEXT NOT NULL, platform TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
  discovered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_merges (
  id INTEGER PRIMARY KEY AUTOINCREMENT, target_contact_id INTEGER NOT NULL REFERENCES contacts(id),
  source_contact_id INTEGER NOT NULL REFERENCES contacts(id), reason TEXT NOT NULL, merged_at TEXT NOT NULL,
  undone_at TEXT, undo_reason TEXT
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS apify_usage (
  month TEXT PRIMARY KEY, estimated_usd REAL NOT NULL DEFAULT 0
);
