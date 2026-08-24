BEGIN IMMEDIATE;
DROP INDEX IF EXISTS one_active_run_per_source;
ALTER TABLE runs RENAME TO runs_before_bina_blocked;
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','blocked')),
  started_at TEXT, finished_at TEXT, pages_checked INTEGER NOT NULL DEFAULT 0,
  phones_found INTEGER NOT NULL DEFAULT 0, unique_phones INTEGER NOT NULL DEFAULT 0,
  error TEXT, cancellation_requested INTEGER NOT NULL DEFAULT 0, needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
INSERT INTO runs (
  id, source_id, status, started_at, finished_at, pages_checked, phones_found,
  unique_phones, error, cancellation_requested, needs_review, created_at
)
SELECT
  id, source_id, status, started_at, finished_at, pages_checked, phones_found,
  unique_phones, error, cancellation_requested, needs_review, created_at
FROM runs_before_bina_blocked;
DROP TABLE runs_before_bina_blocked;
CREATE UNIQUE INDEX one_active_run_per_source ON runs(source_id) WHERE status IN ('queued','running');
PRAGMA user_version = 1;
COMMIT;
