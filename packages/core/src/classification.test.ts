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
    expect(result.signals?.length).toBeGreaterThan(0);
    expect(result.ruleVersion).toBe('1.0.0');
    expect(result.classifiedAt).toBe('2026-08-12T00:00:00.000Z');
    vi.useRealTimers();
  });

  it('prioritizes explicit site seller type over conflicting heuristic text', () => {
    const agencyResult = classifyEvidence({
      text: 'Mülkiyyətçi şəxsi mənzil satışı',
      explicitSellerType: 'agency',
      platform: 'website',
      sourceType: 'bina_agency',
      rawPhone: '+994501234567',
      normalizedPhone: '+994501234567',
    });
    expect(agencyResult.type).toBe('agency');
    expect(agencyResult.reasons).toContain('explicit_site_agency');
    expect(agencyResult.confidence).toBeGreaterThanOrEqual(0.90);
    expect(agencyResult.autoAccept).toBe(true);

    const ownerResult = classifyEvidence({
      text: 'Agentlik yanında kirayə öz mənzilim sahibindən',
      explicitSellerType: 'owner',
    });
    expect(ownerResult.type).toBe('owner');
    expect(ownerResult.autoAccept).toBe(false);

    const agentResult = classifyEvidence({
      text: 'Vasitəçi xidməti',
      explicitSellerType: 'agent',
    });
    expect(agentResult.type).toBe('agent');
    expect(agentResult.reasons).toContain('explicit_site_agent');
  });

  it('website source with confidence >= 90% and clean signals auto-accepts', () => {
    const res = classifyEvidence({
      text: 'Bakı Emlak Agentliyi, mənzil satışı və kirayəsi. Vasitəçi komissiyası.',
      explicitSellerType: 'agency',
      platform: 'website',
      sourceType: 'bina_agency',
      normalizedPhone: '+994501234567',
      rawPhone: '+994501234567',
      occurrenceCount: 2,
    });
    expect(res.confidence).toBeGreaterThanOrEqual(0.90);
    expect(res.autoAccept).toBe(true);
    expect(res.signals?.some((s) => s.key === 'explicit_site_agency')).toBe(true);
  });

  it('website source below 90% routes to review', () => {
    const res = classifyEvidence({
      text: 'Bakı əmlakçı, mənzil satışı',
      platform: 'website',
      normalizedPhone: '+994501234567',
      rawPhone: '+994501234567',
    });
    expect(res.confidence).toBeLessThan(0.90);
    expect(res.autoAccept).toBe(false);
  });

  it('social new contact always routes to manual review', () => {
    const res = classifyEvidence({
      text: 'Baku Luxury Real Estate Agency. Exclusive penthouses.',
      platform: 'instagram',
      sourceType: 'social_instagram',
      normalizedPhone: '+994509998877',
      alreadyVerifiedInDb: false,
    });
    expect(res.autoAccept).toBe(false);
  });

  it('new Instagram contact at 97% still routes to manual review', () => {
    const res = classifyEvidence({
      text: 'Baku Luxury Real Estate Agency. Realtor sales and rent.',
      explicitSellerType: 'agency',
      platform: 'instagram',
      sourceType: 'instagram_profile',
      profileDedicated: true,
      occurrenceCount: 4,
      normalizedPhone: '+994509998877',
      rawPhone: '+994509998877',
      alreadyVerifiedInDb: false,
    });
    expect(res.confidence).toBeGreaterThanOrEqual(0.97);
    expect(res.autoAccept).toBe(false);
  });

  it('social contact with already verified phone auto-merges', () => {
    const res = classifyEvidence({
      text: 'Baku Luxury Real Estate Agency. Exclusive penthouses.',
      platform: 'instagram',
      sourceType: 'social_instagram',
      normalizedPhone: '+994509998877',
      alreadyVerifiedInDb: true,
    });
    expect(res.autoAccept).toBe(true);
  });

  it('approved realtor WhatsApp group auto-accepts high confidence candidate', () => {
    const res = classifyEvidence({
      text: 'Əmlakçılar qrupu: Yeni Yasamal 3 otaq satışda 150000 AZN.',
      platform: 'whatsapp',
      sourceType: 'whatsapp_group',
      isRealtorOnlyWhatsAppGroup: true,
      normalizedPhone: '+994507776655',
      rawPhone: '+994507776655',
    });
    expect(res.confidence).toBeGreaterThanOrEqual(0.90);
    expect(res.autoAccept).toBe(true);
  });

  it('penalizes owner listings and platform hotlines', () => {
    const ownerRes = classifyEvidence({
      text: 'Təcili satılır! Sahibindən öz evimdir, maklerlər qətiyyən narahat etməsin!',
      normalizedPhone: '+994501112233',
    });
    expect(ownerRes.type).toBe('owner');
    expect(ownerRes.confidence).toBe(0);
    expect(ownerRes.autoAccept).toBe(false);

    const hotlineRes = classifyEvidence({
      text: 'info@bina.az',
      normalizedPhone: '+994125990805',
      rawPhone: '+994 12 599 08 05',
    });
    expect(hotlineRes.type).toBe('suspicious');
    expect(hotlineRes.confidence).toBe(0);
    expect(hotlineRes.autoAccept).toBe(false);
  });

  describe('realtor auto-confirm (Subproject D)', () => {
    it('auto-confirms a high-confidence realtor (>=90%) with an Azerbaijan mobile', () => {
      const res = classifyEvidence({
        text: 'Bakı Əmlak Agentliyi — mənzil satışı və kirayəsi. Vasitəçi xidməti.',
        explicitSellerType: 'agent',
        platform: 'telegram',
        sourceType: 'telegram_channel',
        normalizedPhone: '+994501234567',
        rawPhone: '+994501234567',
        occurrenceCount: 3,
      });
      expect(['agent', 'agency']).toContain(res.type);
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.autoAccept).toBe(true);
      expect(res.autoAcceptPolicy).toBe('AUTO_ACCEPT_REALTOR_V1');
    });

    it('keeps a sub-90% realtor in manual review', () => {
      const res = classifyEvidence({
        text: 'əmlakçı',
        platform: 'telegram',
        sourceType: 'telegram_channel',
        normalizedPhone: '+994501234567',
        rawPhone: '+994501234567',
      });
      expect(res.type).toBe('agent');
      expect(res.confidence).toBeLessThan(0.9);
      expect(res.autoAccept).toBe(false);
    });

    it('never auto-accepts a realtor whose only phone is foreign (+90 Turkey)', () => {
      const res = classifyEvidence({
        text: 'Bakı Əmlak Agentliyi — mənzil satışı və kirayəsi. Vasitəçi xidməti.',
        explicitSellerType: 'agency',
        platform: 'telegram',
        sourceType: 'telegram_channel',
        normalizedPhone: '+905551234567',
        rawPhone: '+90 555 123 45 67',
        occurrenceCount: 3,
      });
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.autoAccept).toBe(false);
    });

    it('never auto-accepts a realtor with a malformed non-+994 phone', () => {
      const res = classifyEvidence({
        text: 'Baku real estate agency, apartments for sale.',
        explicitSellerType: 'agency',
        platform: 'website',
        sourceType: 'bina_agency',
        normalizedPhone: '+994123',
        rawPhone: '+994123',
        occurrenceCount: 2,
      });
      expect(res.autoAccept).toBe(false);
    });

    it('still routes social new contacts to manual review despite >=90%', () => {
      const res = classifyEvidence({
        text: 'Baku Luxury Real Estate Agency. Realtor sales and rent.',
        explicitSellerType: 'agency',
        platform: 'instagram',
        sourceType: 'instagram_profile',
        profileDedicated: true,
        occurrenceCount: 4,
        normalizedPhone: '+994509998877',
        rawPhone: '+994509998877',
        alreadyVerifiedInDb: false,
      });
      expect(res.confidence).toBeGreaterThanOrEqual(0.9);
      expect(res.autoAccept).toBe(false);
    });
  });
});
