import { describe, expect, it } from 'vitest';
import { nextBinaRunAt, readBinaSummary } from './bina-view';

describe('readBinaSummary', () => {
  it('returns safe numeric counters from the audit payload', () => {
    expect(readBinaSummary({
      outcomes: { accepted: 4, duplicate: 1, private_seller: 3, blocked: 0, cancelled: 0 },
      newContacts: 2,
      duplicates: 1,
      agenciesFound: 2,
    })).toEqual({ accepted: 4, duplicates: 1, privateSellers: 3, blocked: 0, cancelled: 0, newContacts: 2, agenciesFound: 2 });
  });

  it('uses zeroes for malformed or absent audit details', () => {
    expect(readBinaSummary({ outcomes: { accepted: 'four' }, duplicates: -1 })).toEqual({ accepted: 0, duplicates: 0, privateSellers: 0, blocked: 0, cancelled: 0, newContacts: 0, agenciesFound: 0 });
  });
});

describe('nextBinaRunAt', () => {
  it('schedules six hours after a completed run', () => {
    expect(nextBinaRunAt({ status: 'completed', finishedAt: '2026-08-25T00:00:00.000Z' })).toBe('2026-08-25T06:00:00.000Z');
  });

  it('schedules 24 hours after a blocked run', () => {
    expect(nextBinaRunAt({ status: 'blocked', finishedAt: '2026-08-25T00:00:00.000Z' })).toBe('2026-08-26T00:00:00.000Z');
  });

  it('does not invent a next date without a terminal timestamp', () => {
    expect(nextBinaRunAt({ status: 'running', finishedAt: null })).toBeUndefined();
  });
});
