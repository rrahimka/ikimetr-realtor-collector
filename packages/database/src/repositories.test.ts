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
    const first = repos.contacts.persistEvidence({ normalizedPhone: '+994501234567', isForeign: false, evidence: { sourceId: saved.id, sourceUrl: 'https://example.com/a', locationType: 'listing', excerpt: 'Agent', rawPhone: '0501234567', platform: 'bina.az', fingerprint: 'verified-evidence-01' }, classification });
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
    const a = seed('+994501111111', 'agent', 'website', false);
    const b = seed('+994502222222', 'unknown', 'google-maps', false);
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
});
