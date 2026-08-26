BEGIN IMMEDIATE;

-- Upgrade legacy sources for newly supported Tier B portals to specialized source types
UPDATE sources SET type = 'yeniemlak_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%yeniemlak.az%');

UPDATE sources SET type = 'emlakbazari_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%emlakbazari.az%');

UPDATE sources SET type = 'ipoteka_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%ipoteka.az%');

UPDATE sources SET type = 'city_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%city.az%');

PRAGMA user_version = 5;
COMMIT;
