BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_type TEXT NOT NULL CHECK(lead_type IN ('buyer','seller','renter','landlord','investor','realtor_request','unknown')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','qualified','needs_review','contacted','converted','rejected','expired')),
  source_platform TEXT NOT NULL,
  source_surface TEXT NOT NULL,
  source_url TEXT NOT NULL,
  external_id TEXT,
  username TEXT,
  display_name TEXT,
  public_phone TEXT,
  normalized_phone TEXT,
  intent_excerpt TEXT NOT NULL,
  city TEXT,
  district TEXT,
  metro TEXT,
  property_type TEXT,
  rooms INTEGER,
  budget_min REAL,
  budget_max REAL,
  currency TEXT NOT NULL DEFAULT 'AZN',
  confidence REAL NOT NULL DEFAULT 0.5,
  confidence_level TEXT NOT NULL DEFAULT 'medium' CHECK(confidence_level IN ('high','medium','low')),
  signals_json TEXT NOT NULL DEFAULT '[]',
  parent_context TEXT,
  is_realtor_sender INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS leads_type_status_idx ON leads(lead_type, status);
CREATE INDEX IF NOT EXISTS leads_platform_surface_idx ON leads(source_platform, source_surface);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(normalized_phone);
CREATE INDEX IF NOT EXISTS leads_username_idx ON leads(username);
CREATE INDEX IF NOT EXISTS leads_expires_at_idx ON leads(expires_at);

PRAGMA user_version = 7;
COMMIT;
