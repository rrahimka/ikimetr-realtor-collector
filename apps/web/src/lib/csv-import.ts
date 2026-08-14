import { createHash } from 'node:crypto';
import { classifyEvidence, normalizePhone } from '@ikimetr/core';
import type { createRepositories } from '@ikimetr/database';
import { parseContactsCsv } from './csv';

export type ImportReport = { total: number; accepted: number; rejected: number; duplicates: number; errors: Array<{ line: number; reason: string }> };

const LOCATION_TYPES = ['profile', 'listing', 'post', 'comment'] as const;

export function importContactsCsv(repos: ReturnType<typeof createRepositories>, text: string, sourceName: string): ImportReport {
  const { headers, rows } = parseContactsCsv(text);
  if (!headers.includes('phone')) throw new Error('Missing required header: phone');
  const source = repos.sources.create({ name: sourceName, type: 'test_fixture', locator: 'csv-import', language: 'mixed', maxPages: 1, maxDepth: 0, delayMs: 0, enabled: false, killSwitch: false });

  let accepted = 0, rejected = 0, duplicates = 0;
  const errors: ImportReport['errors'] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    try {
      const phone = row['phone'] ?? '';
      if (!phone) throw new Error('empty phone');
      const normalized = normalizePhone(phone).normalized;
      if (!normalized) throw new Error('invalid phone');
      const rawUrl = row['source_url'] ?? '';
      const sourceUrl = /^https?:\/\//.test(rawUrl) ? rawUrl : 'https://fixture.invalid/import';
      const locationType = (LOCATION_TYPES as readonly string[]).includes(row['location_type'] ?? '') ? (row['location_type'] as (typeof LOCATION_TYPES)[number]) : 'listing';
      const excerpt = row['excerpt'] || [row['name'], row['agency'], phone].filter(Boolean).join(' · ');
      const classification = classifyEvidence({ text: excerpt, occurrenceCount: 1 });
      if (repos.contacts.byPhone(normalized)) { duplicates++; return; }
      repos.contacts.persistEvidence({ normalizedPhone: normalized, isForeign: !normalized.startsWith('+994'), evidence: { sourceId: source.id, sourceUrl, locationType, excerpt, rawPhone: phone, name: row['name'] || null, agency: row['agency'] || null, username: row['username'] || null, platform: row['platform'] || 'csv', fingerprint: createHash('sha256').update(`${normalized}\0${sourceUrl}`).digest('hex') }, classification });
      accepted++;
    } catch (error) {
      rejected++;
      errors.push({ line, reason: error instanceof Error ? error.message : 'invalid row' });
    }
  });

  return { total: rows.length, accepted, rejected, duplicates, errors };
}
