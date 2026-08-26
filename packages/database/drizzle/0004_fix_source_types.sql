BEGIN IMMEDIATE;

-- Upgrade legacy sources created with generic website/listing_page type to specialized source types
UPDATE sources SET type = 'bina_agency', max_depth = 0, delay_ms = CASE WHEN delay_ms < 10000 THEN 10000 ELSE delay_ms END
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%bina.az%');

UPDATE sources SET type = 'tap_az', max_depth = 0, locator = CASE WHEN locator = 'Tap.az' OR locator = 'tap.az' OR locator = 'https://tap.az' OR locator = 'https://tap.az/' THEN 'https://tap.az/elanlar/dasinmaz-emlak' ELSE locator END
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%tap.az%' OR locator = 'Tap.az');

UPDATE sources SET type = 'arenda_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%arenda.az%');

UPDATE sources SET type = 'stop_az', max_depth = 0
WHERE (type = 'website' OR type = 'listing_page') AND (locator LIKE '%stop.az%');

PRAGMA user_version = 4;
COMMIT;
