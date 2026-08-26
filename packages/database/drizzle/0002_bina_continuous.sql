BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS bina_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  seller_type TEXT NOT NULL DEFAULT 'unknown',
  phone TEXT,
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'discovered' CHECK(status IN ('discovered', 'checked', 'skipped_owner', 'failed', 'removed')),
  discovered_at TEXT NOT NULL,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bina_listings_source_url ON bina_listings(source_id, canonical_url);
CREATE INDEX IF NOT EXISTS bina_listings_status ON bina_listings(source_id, status, last_checked_at);

PRAGMA user_version = 2;
COMMIT;
