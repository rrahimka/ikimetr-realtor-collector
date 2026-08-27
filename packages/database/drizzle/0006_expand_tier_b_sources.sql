BEGIN IMMEDIATE;

-- Upgrade legacy sources for VIPemlak, Ev10, Lalafo, and Unvan to specialized source types
UPDATE sources SET type = 'vipemlak_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%vipemlak.az%');

UPDATE sources SET type = 'ev10_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%ev10.az%');

UPDATE sources SET type = 'lalafo_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%lalafo.az%');

UPDATE sources SET type = 'unvan_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%unvan.az%');

PRAGMA user_version = 6;
COMMIT;
