BEGIN IMMEDIATE;

ALTER TABLE sources ADD COLUMN deleted_at TEXT;

PRAGMA user_version = 8;
COMMIT;
