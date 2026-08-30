import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from './index.js';
import { seedDemoData } from './seed.js';

let db: CollectorDatabase | undefined;
afterEach(() => db?.close());

function setup() {
  db = createDatabase(':memory:');
  return createRepositories(db);
}

const source = { name: 'Public listings', type: 'website' as const, locator: 'https://example.com', language: 'AZ' as const, maxPages: 3, maxDepth: 1, delayMs: 0, enabled: true, killSwitch: false };

describe('repositories', () => {
  it('deduplicates a normalized number while preserving every evidence record', () => {
    const repos = setup(); const saved = repos.sources.create(source);
    const classification = { type: 'agent' as const, confidence: 0.85, reasons: ['professional_keywords'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' };
    repos.contacts.persistEvidence({ normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/a', locationType: 'listing', excerpt: 'Əmlakçı 050 123 45 67', rawPhone: '050 123 45 67', platform: 'website', fingerprint: 'fingerprint-00001' }, classification });
    repos.contacts.persistEvidence({ normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/b', locationType: 'listing', excerpt: 'Makler +994501234567', rawPhone: '+994501234567', agency: 'Baku Homes', platform: 'website', fingerprint: 'fingerprint-00002' }, classification });
    expect(repos.contacts.list()).toHaveLength(1);
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(2);
    expect(repos.contacts.list()[0]).toMatchObject({ normalizedPhone: '+994501234567', agency: 'Baku Homes' });
  });

  it('makes repeated evidence imports idempotent', () => {
    const repos = setup(); const saved = repos.sources.create(source);
    const input = { normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/a', locationType: 'listing' as const, excerpt: 'Makler 0501234567', rawPhone: '0501234567', platform: 'website', fingerprint: 'repeat-fingerprint' }, classification: { type: 'agent' as const, confidence: 0.8, reasons: ['professional_keywords'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' } };
    repos.contacts.persistEvidence(input); repos.contacts.persistEvidence(input);
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(1);
  });

  it('preserves a manual verified status while adding evidence from another listing', () => {
    const repos = setup(); const saved = repos.sources.create(source);
    const classification = { type: 'agent' as const, confidence: 0.8, reasons: ['professional_keywords'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-25T00:00:00.000Z' };
    const first = repos.contacts.persistEvidence({ normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/a', locationType: 'listing', excerpt: 'Agent', rawPhone: '0501234567', platform: 'bina.az', fingerprint: 'verified-evidence-01' }, classification })!;
    repos.reviews.setStatus(first.id, 'verified');
    repos.contacts.persistEvidence({ normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/b', locationType: 'listing', excerpt: 'Agentlik', rawPhone: '+994501234567', platform: 'bina.az', fingerprint: 'verified-evidence-02' }, classification });

    expect(repos.contacts.get(first.id)?.verificationStatus).toBe('verified');
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(2);
  });

  it('finishes a blocked Bina run with a safe reason and audit summary', () => {
    const repos = setup();
    const saved = repos.sources.create({ ...source, type: 'bina_agency', locator: 'https://bina.az/search', maxDepth: 0, delayMs: 10_000 });
    const run = repos.runs.enqueue(saved.id);
    repos.runs.claimNext();
    repos.runs.finishBina(run.id, 'blocked', { pagesChecked: 2, phonesFound: 1, uniquePhones: 1 }, 'captcha', {
      outcomes: { accepted: 1, duplicate: 0, private_seller: 1, missing_phone: 0, invalid_phone: 0, page_removed: 0, blocked: 1, parse_error: 0, cancelled: 0 },
      newContacts: 1,
      duplicates: 0,
    });

    expect(repos.runs.get(run.id)).toMatchObject({ status: 'blocked', error: 'captcha', pagesChecked: 2 });
    const summary = repos.audit.list().find((event) => event.action === 'run.bina.summary');
    expect(summary).toMatchObject({
      action: 'run.bina.summary',
      entityType: 'run',
      entityId: run.id,
    });
    if (!summary?.details || typeof summary.details !== 'object') throw new Error('Bina summary details missing');
    const details = summary.details as Record<string, unknown>;
    if (!details.outcomes || typeof details.outcomes !== 'object') throw new Error('Bina outcomes missing');
    expect(details.newContacts).toBe(1);
    expect((details.outcomes as Record<string, unknown>).blocked).toBe(1);
  });

  it('queries active/latest runs and recent listing evidence from SQLite', () => {
    const repos = setup();
    const saved = repos.sources.create({ ...source, type: 'bina_agency', locator: 'https://bina.az/search', maxDepth: 0, delayMs: 10_000 });
    const firstRun = repos.runs.enqueue(saved.id);
    expect(repos.runs.hasActive(saved.id)).toBe(true);
    repos.runs.claimNext();
    repos.runs.finish(firstRun.id, 'completed');
    expect(repos.runs.hasActive(saved.id)).toBe(false);
    expect(repos.runs.latestTerminal(saved.id)?.id).toBe(firstRun.id);

    const classification = { type: 'agency' as const, confidence: 0.9, reasons: ['agency_name'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-25T00:00:00.000Z' };
    repos.contacts.persistEvidence({ normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://bina.az/items/123', locationType: 'listing', excerpt: 'Agentlik', rawPhone: '+994501234567', platform: 'bina.az', fingerprint: 'recent-url-evidence' }, classification });
    expect(repos.evidence.wasUrlSeenSince(saved.id, 'https://bina.az/items/123', '2020-01-01T00:00:00.000Z')).toBe(true);
    expect(repos.evidence.wasUrlSeenSince(saved.id, 'https://bina.az/items/123', '2100-01-01T00:00:00.000Z')).toBe(false);
  });

  it('enforces one active run, supports cancellation, and recovers abandoned work', () => {
    const repos = setup(); const saved = repos.sources.create(source);
    const run = repos.runs.enqueue(saved.id);
    expect(() => repos.runs.enqueue(saved.id)).toThrow('active run');
    expect(repos.runs.claimNext()?.status).toBe('running');
    repos.runs.requestCancellation(run.id);
    expect(repos.runs.shouldCancel(run.id)).toBe(true);
    repos.runs.recoverAbandoned();
    expect(repos.runs.get(run.id)).toMatchObject({ status: 'failed', needsReview: true });
  });

  it('merges contacts reversibly without deleting evidence', () => {
    const repos = setup(); const saved = repos.sources.create(source);
    const classification = { type: 'unknown' as const, confidence: 0.3, reasons: [], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' };
    for (const [index, phone] of ['+994501111111', '+994502222222'].entries()) repos.contacts.persistEvidence({ normalizedPhone: phone, isForeign: false, evidence: { sourceId: saved.id, sourceUrl: `https://example.com/${index}`, locationType: 'profile', excerpt: phone, rawPhone: phone, platform: 'website', fingerprint: `merge-fingerprint-${index}` }, classification });
    const contacts = repos.contacts.list();
    const merge = repos.reviews.merge(contacts[0]!.id, contacts[1]!.id, 'manual check');
    expect(repos.contacts.get(contacts[1]!.id)?.mergedIntoId).toBe(contacts[0]!.id);
    expect(repos.contacts.evidenceFor('+994502222222')).toHaveLength(1);
    repos.reviews.undoMerge(merge.id, 'mistake');
    expect(repos.contacts.get(contacts[1]!.id)?.mergedIntoId).toBeNull();
    expect(repos.audit.list().map((item) => item.action)).toEqual(['contact.merge', 'contact.merge.undo']);
  });

  it('filters contacts by type, platform, verification status and origin', () => {
    const repos = setup(); const saved = repos.sources.create(source);
    const seed = (phone: string, type: 'agent' | 'unknown', platform: string, isForeign: boolean) => repos.contacts.persistEvidence({ normalizedPhone: phone, isForeign, evidence: { sourceId: saved.id, sourceUrl: `https://example.com/${phone}`, locationType: 'listing', excerpt: phone, rawPhone: phone, platform, fingerprint: `filter-${phone}` }, classification: { type, confidence: 0.8, reasons: [], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' } });
    const a = seed('+994501111111', 'agent', 'website', false)!;
    const b = seed('+994502222222', 'unknown', 'google-maps', false)!;
    seed('+79161111111', 'agent', 'website', true);
    repos.reviews.setStatus(a.id, 'verified');
    repos.reviews.setStatus(b.id, 'rejected');
    expect(repos.contacts.list('', { type: 'agent' })).toHaveLength(2);
    expect(repos.contacts.list('', { platform: 'google-maps' })).toHaveLength(1);
    expect(repos.contacts.list('', { verificationStatus: 'verified' })).toHaveLength(1);
    expect(repos.contacts.list('', { isForeign: true })).toHaveLength(1);
    expect(repos.contacts.list('', { type: 'agent', verificationStatus: 'verified' })).toHaveLength(1);
    expect(repos.contacts.list('', { type: 'agent', isForeign: false })).toHaveLength(1);
  });

  it('tracks delta listings, checkpointing, and stats for continuous collection', () => {
    const repos = setup();
    const saved = repos.sources.create({ ...source, type: 'bina_agency' });

    // Discovered batch
    const count = repos.binaListings.upsertDiscovered(saved.id, [
      'https://bina.az/items/101',
      'https://bina.az/items/102',
      'https://bina.az/items/103',
    ]);
    expect(count).toBe(3);

    const pending = repos.binaListings.getUnchecked(saved.id, 2);
    expect(pending).toHaveLength(2);
    expect(pending[0]?.canonicalUrl).toBe('https://bina.az/items/101');

    // Mark checked
    repos.binaListings.markChecked(saved.id, 'https://bina.az/items/101', {
      sellerType: 'agency',
      phone: '+994501234567',
      fingerprint: 'fp-101',
      status: 'checked',
    });
    repos.binaListings.markChecked(saved.id, 'https://bina.az/items/102', {
      sellerType: 'owner',
      status: 'skipped_owner',
    });

    const stats = repos.binaListings.stats(saved.id);
    expect(stats.totalDiscovered).toBe(3);
    expect(stats.totalChecked).toBe(2);
    expect(stats.professionalCount).toBe(1);
    expect(stats.privateSkippedCount).toBe(1);
    expect(stats.pendingCount).toBe(1);

    expect(repos.binaListings.wasUrlCheckedRecently(saved.id, 'https://bina.az/items/101', '2020-01-01T00:00:00.000Z')).toBe(true);
    expect(repos.binaListings.wasUrlCheckedRecently(saved.id, 'https://bina.az/items/103', '2020-01-01T00:00:00.000Z')).toBe(false);
  });

  it('seeds demo keywords and a fixture source idempotently', () => {
    const repos = setup();
    const first = seedDemoData(db!);
    const second = seedDemoData(db!);
    expect(first.sourceCreated).toBe(true);
    expect(second.sourceCreated).toBe(false);
    expect(repos.sources.list().filter((s) => s.type === 'test_fixture')).toHaveLength(1);
    expect(repos.keywords.list()).toHaveLength(8);
  });

  it('manages leads, deduplicates by phone/platform, and updates status', () => {
    const repos = setup();
    const lead1 = repos.leads.create({
      leadType: 'buyer',
      status: 'new',
      sourcePlatform: 'telegram',
      sourceSurface: 'message_text',
      sourceUrl: 'https://t.me/baku_emlak/123',
      username: 'baku_buyer_99',
      displayName: 'Elvin',
      publicPhone: '0501112233',
      normalizedPhone: '+994501112233',
      intentExcerpt: 'Yasamalda 2 otaqlı mənzil axtarıram',
      district: 'Yasamal',
      propertyType: 'apartment',
      rooms: 2,
      budgetMax: 180000,
      currency: 'AZN',
      confidence: 0.85,
      confidenceLevel: 'high',
      signals: ['buyer:axtariram', 'geo:Yasamal'],
    });

    expect(lead1.isNew).toBe(true);
    expect(lead1.lead.id).toBeGreaterThan(0);
    expect(lead1.lead.leadType).toBe('buyer');
    expect(lead1.lead.district).toBe('Yasamal');

    // Duplicate by phone should update existing lead without creating a second row
    const lead2 = repos.leads.create({
      leadType: 'buyer',
      status: 'new',
      sourcePlatform: 'telegram',
      sourceSurface: 'message_text',
      sourceUrl: 'https://t.me/baku_emlak/124',
      username: 'baku_buyer_99',
      normalizedPhone: '+994501112233',
      intentExcerpt: 'Yasamalda mənzil axtarıram təcili',
      budgetMax: 190000,
      confidence: 0.9,
      confidenceLevel: 'high',
      signals: ['buyer:axtariram'],
    });

    expect(lead2.isNew).toBe(false);
    expect(lead2.lead.id).toBe(lead1.lead.id);
    expect(lead2.lead.budgetMax).toBe(190000);

    // List and filter
    const all = repos.leads.list();
    expect(all).toHaveLength(1);

    // Update status
    const updated = repos.leads.updateStatus(lead1.lead.id, 'qualified');
    expect(updated.status).toBe('qualified');

    // Stats
    const stats = repos.leads.stats();
    expect(stats.total).toBe(1);
    expect(stats.buyers).toBe(1);
    expect(stats.highConfidence).toBe(1);
  });

  it('calculates persistent daily dashboard metrics with Asia/Baku boundary', () => {
    const repos = setup();
    const saved = repos.sources.create(source);

    // 1. Create a contact and run before today
    const classification = { type: 'agent' as const, confidence: 0.9, reasons: ['agency_name'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-01T00:00:00.000Z' };
    const oldContact = repos.contacts.persistEvidence({
      normalizedPhone: '+994501111111',
      isForeign: false,
      evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/old', locationType: 'listing', excerpt: 'Old Makler', rawPhone: '0501111111', platform: 'website', fingerprint: 'old-fp' },
      classification,
    });
    // Manually set old contact firstSeenAt to 2026-08-01
    db!.prepare('UPDATE contacts SET first_seen_at=? WHERE id=?').run('2026-08-01T00:00:00.000Z', oldContact!.id);

    // 2. Create a new contact today
    repos.contacts.persistEvidence({
      normalizedPhone: '+994502222222',
      isForeign: false,
      evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/new', locationType: 'listing', excerpt: 'New Makler', rawPhone: '0502222222', platform: 'website', fingerprint: 'new-fp' },
      classification,
    });

    // 3. Enrich the old contact today with new evidence
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501111111',
      isForeign: false,
      evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/enrich', locationType: 'listing', excerpt: 'Enriched Makler', rawPhone: '0501111111', platform: 'website', fingerprint: 'enrich-fp' },
      classification,
    });

    // 4. Create a completed run today
    const run = repos.runs.enqueue(saved.id);
    repos.runs.claimNext();
    repos.runs.finish(run.id, 'completed', { pagesChecked: 5, phonesFound: 2, uniquePhones: 2 });

    // 5. Create a lead today
    repos.leads.create({
      leadType: 'buyer',
      status: 'new',
      sourcePlatform: 'telegram',
      sourceSurface: 'post',
      sourceUrl: 'https://t.me/baku/1',
      intentExcerpt: 'Axtariram',
      confidence: 0.8,
      confidenceLevel: 'high',
    });

    const dashStats = repos.dashboard.stats();
    expect(dashStats.contacts).toBe(2);
    expect(dashStats.newContactsToday).toBe(1);
    expect(dashStats.enrichedContactsToday).toBe(1);
    expect(dashStats.leads).toBe(1);
    expect(dashStats.newLeadsToday).toBe(1);
    expect(dashStats.runsToday).toBe(1);
    expect(dashStats.successfulRunsToday).toBe(1);
    expect(dashStats.failedRunsToday).toBe(0);
    expect(dashStats.bakuDateIso).toContain('T');
  });

  it('soft-deletes a source while preserving contacts, evidence, and historical runs', () => {
    const repos = setup();
    const saved = repos.sources.create(source);
    const run = repos.runs.enqueue(saved.id);
    repos.runs.claimNext();
    repos.runs.finish(run.id, 'completed', { pagesChecked: 2, phonesFound: 1, uniquePhones: 1 });

    const classification = { type: 'agent' as const, confidence: 0.95, autoAccept: true, reasons: ['agency_name'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-25T00:00:00.000Z' };
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/item1', locationType: 'listing', excerpt: 'Agent', rawPhone: '0501234567', platform: 'website', fingerprint: 'fp-delete-test' },
      classification,
    });

    expect(repos.sources.list().some((s) => s.id === saved.id)).toBe(true);
    expect(repos.contacts.list()).toHaveLength(1);
    expect(repos.evidence.wasUrlSeenSince(saved.id, 'https://example.com/item1', '2020-01-01T00:00:00.000Z')).toBe(true);

    // Delete source
    const removed = repos.sources.remove(saved.id);
    expect(removed).toBe(true);

    // Source is hidden from active list
    expect(repos.sources.list().some((s) => s.id === saved.id)).toBe(false);

    // Contacts and evidence are preserved!
    expect(repos.contacts.list()).toHaveLength(1);
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(1);
    expect(repos.runs.get(run.id)).toBeDefined();
  });

  it('never enqueues or claims work for a soft-deleted source', () => {
    const repos = setup();
    const saved = repos.sources.create(source);
    const queued = repos.runs.enqueue(saved.id);

    expect(repos.sources.remove(saved.id)).toBe(true);
    expect(() => repos.runs.enqueue(saved.id)).toThrow('source is deleted');
    expect(repos.runs.claimNext()).toBeUndefined();
    expect(repos.runs.get(queued.id)).toMatchObject({ status: 'cancelled' });
  });

  it('tracks origin groups and provides origin counts for websites, social, whatsapp, and review', () => {
    const repos = setup();
    const savedWeb = repos.sources.create({ ...source, type: 'bina_agency' });
    const savedSocial = repos.sources.create({ ...source, name: 'Instagram', type: 'instagram_profile', locator: 'https://instagram.com/baku' });
    const savedWA = repos.sources.create({ ...source, name: 'WhatsApp Group', type: 'telegram_group', locator: 'https://chat.whatsapp.com/123' });

    // 1. Website auto-accepted contact
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501111111',
      isForeign: false,
      evidence: { sourceId: savedWeb.id, sourceUrl: 'https://bina.az/items/1', locationType: 'listing', excerpt: 'Bina Agency', rawPhone: '0501111111', platform: 'website', fingerprint: 'fp-w1' },
      classification: { type: 'agency', confidence: 0.95, autoAccept: true, reasons: ['agency_name'], ruleVersion: '1.0.0', classifiedAt: '2026-08-25T00:00:00.000Z' },
    });

    // 2. Social unreviewed candidate
    repos.contacts.persistEvidence({
      normalizedPhone: '+994502222222',
      isForeign: false,
      evidence: { sourceId: savedSocial.id, sourceUrl: 'https://instagram.com/p/123', locationType: 'profile', excerpt: 'Insta agent', rawPhone: '0502222222', platform: 'instagram', fingerprint: 'fp-s1' },
      classification: { type: 'agent', confidence: 0.75, autoAccept: false, reasons: ['professional_keywords'], ruleVersion: '1.0.0', classifiedAt: '2026-08-25T00:00:00.000Z' },
    });

    // 3. WhatsApp contact
    repos.contacts.persistEvidence({
      normalizedPhone: '+994503333333',
      isForeign: false,
      evidence: { sourceId: savedWA.id, sourceUrl: 'https://chat.whatsapp.com/123', locationType: 'post', excerpt: 'WA broker', rawPhone: '0503333333', platform: 'whatsapp', fingerprint: 'fp-wa1' },
      classification: { type: 'agent', confidence: 0.92, autoAccept: true, reasons: ['whatsapp_realtor_group'], ruleVersion: '1.0.0', classifiedAt: '2026-08-25T00:00:00.000Z' },
    });

    const counts = repos.contacts.originCounts();
    expect(counts.total).toBe(3);
    expect(counts.website).toBe(1);
    expect(counts.social).toBe(1);
    expect(counts.whatsapp).toBe(1);
    expect(counts.unreviewed).toBe(1);

    const pending = repos.reviews.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.normalizedPhone).toBe('+994502222222');
    expect(pending[0]?.primaryOrigin).toBe('social');
  });

  it('keeps a website candidate at 78% in the review queue', () => {
    const repos = setup();
    const saved = repos.sources.create(source);
    const contact = repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/78', locationType: 'listing', excerpt: 'Əmlakçı', rawPhone: '+994501234567', platform: 'website', fingerprint: 'website-confidence-78' },
      classification: { type: 'agent', confidence: 0.78, autoAccept: false, reasons: ['professional_keywords'], ruleVersion: '1.0.0', classifiedAt: '2026-08-28T00:00:00.000Z' },
    });
    expect(contact).toMatchObject({ confidence: 0.78, verificationStatus: 'unreviewed' });
  });
});

describe('collector sessions', () => {
  it('creates, heartbeats, computes counters and stops a continuous run', () => {
    const repos = setup();
    const webSource = repos.sources.create(source);
    const session = repos.collectorSessions.create('web');
    expect(repos.collectorSessions.getActive()?.id).toBe(session.id);

    repos.collectorSessions.heartbeat(session.id);
    const afterBeat = repos.collectorSessions.get(session.id)!;
    expect(afterBeat.lastHeartbeatAt).not.toBeNull();

    // Enqueue a run belonging to the session and complete it with metrics.
    const run = repos.runs.enqueue(webSource.id, session.id);
    repos.runs.claimNext();
    repos.runs.finish(run.id, 'completed', { pagesChecked: 3, phonesFound: 2, uniquePhones: 2 }, undefined, { newContacts: 1, duplicates: 1 });

    const counters = repos.collectorSessions.computeCounters(session.id);
    expect(counters).toMatchObject({ pagesChecked: 3, discoveredListings: 2, newContacts: 1, duplicates: 1, runsCompleted: 1 });

    const stopped = repos.collectorSessions.markStopped(session.id, 'user_requested');
    expect(stopped?.status).toBe('stopped');
    expect(repos.collectorSessions.getActive()).toBeUndefined();
  });

  it('stores the session id on a run for traceability', () => {
    const repos = setup();
    const webSource = repos.sources.create(source);
    const session = repos.collectorSessions.create('web');
    const run = repos.runs.enqueue(webSource.id, session.id);
    expect(repos.runs.get(run.id)?.sessionId).toBe(session.id);
  });
});

describe('cross-source deduplication (Part 11 / 12)', () => {
  it('merges the same Azerbaijani phone discovered on a website and in a WhatsApp group into one contact with both provenance records', () => {
    const repos = setup();
    const websiteSource = repos.sources.create(source);
    const waSource = repos.sources.create({ ...source, type: 'telegram_group', locator: 'https://chat.whatsapp.com/realtors' });
    const classification = { type: 'agent' as const, confidence: 0.85, reasons: ['professional_keywords'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' };

    repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: websiteSource.id, sourceUrl: 'https://example.com/a', locationType: 'listing', excerpt: 'Əmlakçı 050 123 45 67', rawPhone: '050 123 45 67', platform: 'website', fingerprint: 'xsrc-web' },
      classification,
    });
    // Same person later found in an authorized WhatsApp realtor group (different local form).
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: waSource.id, sourceUrl: 'whatsapp://group/realtors?msg=9', locationType: 'comment', excerpt: 'Baku agency +994501234567', rawPhone: '994501234567', platform: 'whatsapp', fingerprint: 'xsrc-wa' },
      classification,
    });

    const contacts = repos.contacts.list();
    expect(contacts).toHaveLength(1);
    const contact = contacts[0]!;
    expect(contact.normalizedPhone).toBe('+994501234567');
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(2);
    // Provenance preserved across both sources.
    expect(contact.originGroups).toContain('website');
    expect(contact.originGroups).toContain('whatsapp');
  });

  it('does not create a duplicate when the WhatsApp number is already known from the web', () => {
    const repos = setup();
    const websiteSource = repos.sources.create(source);
    const classification = { type: 'agent' as const, confidence: 0.85, reasons: ['professional_keywords'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' };
    repos.contacts.persistEvidence({
      normalizedPhone: '+994507776655',
      isForeign: false,
      evidence: { sourceId: websiteSource.id, sourceUrl: 'https://example.com/x', locationType: 'listing', excerpt: 'Makler 050 777 66 55', rawPhone: '050 777 66 55', platform: 'website', fingerprint: 'known-web' },
      classification,
    });
    const before = repos.contacts.list().length;
    const waSource = repos.sources.create({ ...source, type: 'telegram_group', locator: 'https://chat.whatsapp.com/g2' });
    const saved = repos.contacts.persistEvidence({
      normalizedPhone: '+994507776655',
      isForeign: false,
      evidence: { sourceId: waSource.id, sourceUrl: 'whatsapp://group/g2?msg=1', locationType: 'comment', excerpt: 'realtor 0507776655', rawPhone: '+994507776655', platform: 'whatsapp', fingerprint: 'known-wa' },
      classification,
    });
    expect(saved).toBeTruthy();
    expect(repos.contacts.list()).toHaveLength(before);
  });

  it('merges the same phone discovered on website, TikTok, and WhatsApp into one contact with all three provenance records', () => {
    const repos = setup();
    const websiteSource = repos.sources.create(source);
    const tiktokSource = repos.sources.create({ ...source, type: 'instagram_profile', locator: 'https://tiktok.com/@realtor' });
    const waSource = repos.sources.create({ ...source, type: 'telegram_group', locator: 'https://chat.whatsapp.com/g3' });
    const classification = { type: 'agent' as const, confidence: 0.85, reasons: ['professional_keywords'], ruleVersion: '1.0.0' as const, classifiedAt: '2026-08-12T00:00:00.000Z' };

    // 1. Website discovers the number in local AZ format
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: websiteSource.id, sourceUrl: 'https://example.com/a', locationType: 'listing', excerpt: 'Əmlakçı 050 123 45 67', rawPhone: '050 123 45 67', platform: 'website', fingerprint: 'triple-web' },
      classification,
    });
    expect(repos.contacts.list()).toHaveLength(1);

    // 2. TikTok discovers the same number in +994 format
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: tiktokSource.id, sourceUrl: 'https://tiktok.com/@realtor', locationType: 'profile', excerpt: 'Realtor +994501234567', rawPhone: '+994501234567', platform: 'tiktok', fingerprint: 'triple-tt' },
      classification,
    });
    expect(repos.contacts.list()).toHaveLength(1);

    // 3. WhatsApp group discovers the same number in 994 format (no +)
    repos.contacts.persistEvidence({
      normalizedPhone: '+994501234567',
      isForeign: false,
      evidence: { sourceId: waSource.id, sourceUrl: 'whatsapp://group/g3?msg=42', locationType: 'comment', excerpt: 'Agent 994501234567', rawPhone: '994501234567', platform: 'whatsapp', fingerprint: 'triple-wa' },
      classification,
    });
    expect(repos.contacts.list()).toHaveLength(1);

    // All three evidence records preserved
    const evidence = repos.contacts.evidenceFor('+994501234567');
    expect(evidence).toHaveLength(3);
    const platforms = evidence.map((e) => e.platform).sort();
    expect(platforms).toEqual(['tiktok', 'website', 'whatsapp']);

    // Origin groups reflect all sources (TikTok and Instagram are classified as 'social')
    const contact = repos.contacts.list()[0]!;
    expect(contact.originGroups).toContain('website');
    expect(contact.originGroups).toContain('social');
    expect(contact.originGroups).toContain('whatsapp');
  });
});
