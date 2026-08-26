import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', { id: integer('id').primaryKey({ autoIncrement: true }), name: text('name').notNull(), type: text('type').notNull(), locator: text('locator').notNull(), language: text('language').notNull(), maxPages: integer('max_pages').notNull(), maxDepth: integer('max_depth').notNull(), delayMs: integer('delay_ms').notNull(), enabled: integer('enabled', { mode: 'boolean' }).notNull(), killSwitch: integer('kill_switch', { mode: 'boolean' }).notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull() });

export const keywords = sqliteTable('keywords', { id: integer('id').primaryKey({ autoIncrement: true }), value: text('value').notNull().unique(), language: text('language').notNull(), createdAt: text('created_at').notNull() });

export const runs = sqliteTable('runs', { id: integer('id').primaryKey({ autoIncrement: true }), sourceId: integer('source_id').notNull().references(() => sources.id), status: text('status').notNull(), startedAt: text('started_at'), finishedAt: text('finished_at'), pagesChecked: integer('pages_checked').notNull(), phonesFound: integer('phones_found').notNull(), uniquePhones: integer('unique_phones').notNull(), error: text('error'), cancellationRequested: integer('cancellation_requested', { mode: 'boolean' }).notNull(), needsReview: integer('needs_review', { mode: 'boolean' }).notNull(), createdAt: text('created_at').notNull() });

export const contacts = sqliteTable('contacts', { id: integer('id').primaryKey({ autoIncrement: true }), normalizedPhone: text('normalized_phone').notNull(), originalPhone: text('original_phone').notNull(), isForeign: integer('is_foreign', { mode: 'boolean' }).notNull(), type: text('type').notNull(), name: text('name'), agency: text('agency'), city: text('city'), username: text('username'), platform: text('platform'), confidence: real('confidence').notNull(), reasonsJson: text('reasons_json').notNull(), ruleVersion: text('rule_version').notNull(), classifiedAt: text('classified_at').notNull(), verificationStatus: text('verification_status').notNull(), mergedIntoId: integer('merged_into_id'), firstSeenAt: text('first_seen_at').notNull(), lastSeenAt: text('last_seen_at').notNull() }, (table) => [uniqueIndex('contacts_phone').on(table.normalizedPhone)]);

export const evidence = sqliteTable('evidence', { id: integer('id').primaryKey({ autoIncrement: true }), contactId: integer('contact_id').notNull().references(() => contacts.id), sourceId: integer('source_id').notNull().references(() => sources.id), sourceUrl: text('source_url').notNull(), locationType: text('location_type').notNull(), excerpt: text('excerpt').notNull(), rawPhone: text('raw_phone').notNull(), platform: text('platform').notNull(), fingerprint: text('fingerprint').notNull(), discoveredAt: text('discovered_at').notNull() }, (table) => [uniqueIndex('evidence_fingerprint').on(table.fingerprint)]);

export const contactMerges = sqliteTable('contact_merges', { id: integer('id').primaryKey({ autoIncrement: true }), targetContactId: integer('target_contact_id').notNull().references(() => contacts.id), sourceContactId: integer('source_contact_id').notNull().references(() => contacts.id), reason: text('reason').notNull(), mergedAt: text('merged_at').notNull(), undoneAt: text('undone_at'), undoReason: text('undo_reason') });

export const auditEvents = sqliteTable('audit_events', { id: integer('id').primaryKey({ autoIncrement: true }), action: text('action').notNull(), entityType: text('entity_type').notNull(), entityId: integer('entity_id').notNull(), detailsJson: text('details_json').notNull(), createdAt: text('created_at').notNull() });

export const apifyUsage = sqliteTable('apify_usage', { month: text('month').primaryKey(), estimatedUsd: real('estimated_usd').notNull() });

export const binaListings = sqliteTable('bina_listings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceId: integer('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  listingId: text('listing_id').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  sellerType: text('seller_type').notNull(),
  phone: text('phone'),
  fingerprint: text('fingerprint'),
  status: text('status').notNull(),
  discoveredAt: text('discovered_at').notNull(),
  lastCheckedAt: text('last_checked_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('bina_listings_source_url').on(table.sourceId, table.canonicalUrl),
]);

export const adapterRecipes = sqliteTable('adapter_recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  domain: text('domain').notNull().unique(),
  version: integer('version').notNull().default(1),
  recipeJson: text('recipe_json').notNull(),
  confidence: real('confidence').notNull().default(0.0),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sourceCheckpoints = sqliteTable('source_checkpoints', {
  sourceId: integer('source_id').primaryKey().references(() => sources.id, { onDelete: 'cascade' }),
  checkpointType: text('checkpoint_type').notNull(),
  lastCheckpointId: text('last_checkpoint_id').notNull(),
  itemsProcessed: integer('items_processed').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
