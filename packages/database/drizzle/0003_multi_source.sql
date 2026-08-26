BEGIN IMMEDIATE;

ALTER TABLE contacts ADD COLUMN city TEXT;

CREATE TABLE IF NOT EXISTS adapter_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  recipe_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_checkpoints (
  source_id INTEGER PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  checkpoint_type TEXT NOT NULL,
  last_checkpoint_id TEXT NOT NULL,
  items_processed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

PRAGMA user_version = 3;
COMMIT;
