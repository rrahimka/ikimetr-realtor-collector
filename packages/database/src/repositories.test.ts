import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from './index.js';

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
    for (const [index, phone] of ['+994501111111', '+994502222222'].entries()) repos.contacts.persistEvidence({ normalizedPhone: phone!, isForeign: false, evidence: { sourceId: saved.id, sourceUrl: `https://example.com/${index}`, locationType: 'profile', excerpt: phone!, rawPhone: phone!, platform: 'website', fingerprint: `merge-fingerprint-${index}` }, classification });
    const contacts = repos.contacts.list();
    const merge = repos.reviews.merge(contacts[0]!.id, contacts[1]!.id, 'manual check');
    expect(repos.contacts.get(contacts[1]!.id)?.mergedIntoId).toBe(contacts[0]!.id);
    expect(repos.contacts.evidenceFor('+994502222222')).toHaveLength(1);
    repos.reviews.undoMerge(merge.id, 'mistake');
    expect(repos.contacts.get(contacts[1]!.id)?.mergedIntoId).toBeNull();
    expect(repos.audit.list().map((item) => item.action)).toEqual(['contact.merge', 'contact.merge.undo']);
  });
});
