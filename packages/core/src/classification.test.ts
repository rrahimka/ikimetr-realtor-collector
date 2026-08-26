import { describe, expect, it, vi } from 'vitest';
import { classifyEvidence } from './classification.js';

describe('classifyEvidence', () => {
  it.each([
    ['AZ', 'Bakı əmlakçı, mənzil satışı və kirayə. 12 elan.', 'agent'],
    ['RU', 'Риелтор Баку, продажа и аренда недвижимости. 8 объявлений.', 'agent'],
    ['EN', 'Baku realtor at Caspian Estate agency. Houses for sale and rent.', 'agency'],
    ['mixed', 'Bakı real estate маклер — apartment kirayə və satış.', 'agent'],
  ] as const)('classifies %s professional text with transparent reasons', (_language, text, expectedType) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'));
    const result = classifyEvidence({ text, occurrenceCount: 3 });
    expect(result.type).toBe(expectedType);
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.ruleVersion).toBe('1.0.0');
    expect(result.classifiedAt).toBe('2026-08-12T00:00:00.000Z');
    vi.useRealTimers();
  });

  it('prioritizes explicit site seller type over conflicting heuristic text', () => {
    // Text mentions 'owner selling', but explicit site says 'agency'
    const agencyResult = classifyEvidence({
      text: 'Mülkiyyətçi şəxsi mənzil satışı',
      explicitSellerType: 'agency',
    });
    expect(agencyResult.type).toBe('agency');
    expect(agencyResult.reasons).toContain('explicit_site_seller_type');
    expect(agencyResult.confidence).toBeGreaterThanOrEqual(0.85);

    // Text mentions 'agentlik', but explicit site says 'owner'
    const ownerResult = classifyEvidence({
      text: 'Agentlik yanında kirayə',
      explicitSellerType: 'owner',
    });
    expect(ownerResult.type).toBe('owner');
    expect(ownerResult.reasons).toContain('explicit_site_seller_type');

    // Explicit agent
    const agentResult = classifyEvidence({
      text: 'Vasitəçi xidməti',
      explicitSellerType: 'agent',
    });
    expect(agentResult.type).toBe('agent');
    expect(agentResult.reasons).toContain('explicit_site_seller_type');
  });

  it('keeps non-professional sale text uncertain', () => {
    const result = classifyEvidence({ text: 'Owner selling one apartment in Baku', occurrenceCount: 1 });
    expect(result.type).toBe('owner');
    expect(result.confidence).toBeLessThan(0.65);
  });

  it('classifies the visible Bina Agentlik marker as an agency signal', () => {
    const result = classifyEvidence({ text: 'Agentlik · Bakı Emlak · Bakı', occurrenceCount: 1 });
    expect(result.type).toBe('agency');
    expect(result.reasons).toContain('agency_name');
  });
});
