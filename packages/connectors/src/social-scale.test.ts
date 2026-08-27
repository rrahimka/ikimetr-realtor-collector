import { describe, it, expect } from 'vitest';
import {
  evaluateSocialCandidate,
  processSocialScaleBatch,
  type SocialDiscoveryCandidate,
  AZ_CITIES,
  BAKU_DISTRICTS,
  KNOWN_AZ_AGENCIES,
  REAL_ESTATE_HASHTAGS,
} from './social-scale';

describe('Social Scale-Up Engine', () => {
  it('covers major Azerbaijan cities and Baku districts', () => {
    expect(AZ_CITIES).toContain('Bakı');
    expect(AZ_CITIES).toContain('Sumqayıt');
    expect(AZ_CITIES).toContain('Gəncə');
    expect(AZ_CITIES).toContain('Xırdalan');

    expect(BAKU_DISTRICTS).toContain('Nərimanov');
    expect(BAKU_DISTRICTS).toContain('Yasamal');
    expect(BAKU_DISTRICTS).toContain('Nəsimi');
    expect(BAKU_DISTRICTS).toContain('Xətai');
  });

  it('contains verified Azerbaijan real estate agencies and hashtags', () => {
    expect(KNOWN_AZ_AGENCIES).toContain('Quliyev Estates');
    expect(KNOWN_AZ_AGENCIES).toContain('EVA Group "Şans Əmlak"');
    expect(KNOWN_AZ_AGENCIES).toContain('ADAM Estate');

    expect(REAL_ESTATE_HASHTAGS).toContain('#emlak');
    expect(REAL_ESTATE_HASHTAGS).toContain('#daşınmazəmlak');
    expect(REAL_ESTATE_HASHTAGS).toContain('#bakuemlak');
  });

  it('evaluates Instagram and TikTok candidates across different discovery strategies', () => {
    const igCandidate: SocialDiscoveryCandidate = {
      platform: 'instagram',
      strategy: 'agency',
      seed: 'Quliyev Estates',
      url: 'https://instagram.com/quliyev_estates',
      username: 'quliyev_estates',
      data: {
        username: 'quliyev_estates',
        fullName: 'Quliyev Estates Real Estate',
        biography: 'Daşınmaz əmlak agentliyi Bakı. Tel: +994507913630',
        publicPhone: '+994507913630',
      },
    };

    const res = evaluateSocialCandidate(igCandidate);
    expect(res.accepted).toBe(true);
    expect(res.evidence?.rawPhone).toBe('+994507913630');
    expect(res.evidence?.platform).toBe('instagram');
  });

  it('processes scale batch and computes strategy yields correctly', () => {
    const existingPhones = new Set(['+994507913630']); // existing website contact

    const batch: SocialDiscoveryCandidate[] = [
      // 1. Existing website match
      {
        platform: 'instagram',
        strategy: 'website_cross_match',
        seed: 'bina_agency',
        url: 'https://instagram.com/quliyev_estates',
        username: 'quliyev_estates',
        data: {
          username: 'quliyev_estates',
          fullName: 'Quliyev Estates',
          biography: 'Əmlak agentliyi. Tel: +994507913630',
          publicPhone: '+994507913630',
        },
      },
      // 2. New unique IG agency
      {
        platform: 'instagram',
        strategy: 'agency',
        seed: 'Grand Estate Baku',
        url: 'https://instagram.com/grand_estate_baku',
        username: 'grand_estate_baku',
        data: {
          username: 'grand_estate_baku',
          fullName: 'Grand Estate Baku',
          biography: 'Агентство недвижимости в Баку. Продажа квартир. Тел: 050 999 11 22',
          publicPhone: '+994509991122',
        },
      },
      // 3. New unique TikTok realtor from hashtag
      {
        platform: 'tiktok',
        strategy: 'hashtag',
        seed: '#bakuemlak',
        url: 'https://tiktok.com/@rieltor_xirdalan',
        username: 'rieltor_xirdalan',
        data: {
          username: 'rieltor_xirdalan',
          nickname: 'Xırdalan Əmlak',
          signature: 'Xırdalanda mənzil satışı və kirayəsi. Əlaqə: 070 333 22 11',
          publicPhone: '+994703332211',
        },
      },
      // 4. Rejected unrelated TikTok user
      {
        platform: 'tiktok',
        strategy: 'keyword',
        seed: 'dance',
        url: 'https://tiktok.com/@baku_dancer',
        username: 'baku_dancer',
        data: {
          username: 'baku_dancer',
          nickname: 'Rəqs Qrupu',
          signature: 'Milli rəqslər. Tel: 055 444 33 22',
          publicPhone: '+994554443322',
        },
      },
      // 5. No phone realtor
      {
        platform: 'instagram',
        strategy: 'geo',
        seed: 'Gəncə əmlak',
        url: 'https://instagram.com/gence_emlak_direct',
        username: 'gence_emlak_direct',
        data: {
          username: 'gence_emlak_direct',
          fullName: 'Gəncə Əmlak',
          biography: 'Gəncədə evlərin alqı-satqısı. Direct-ə yazın.',
        },
      },
    ];

    const report = processSocialScaleBatch(batch, existingPhones);
    expect(report.totalChecked).toBe(5);
    expect(report.totalAccepted).toBe(3);
    expect(report.instagram.accepted).toBe(2);
    expect(report.tiktok.accepted).toBe(1);
    expect(report.matchedExistingWebsiteContacts).toBe(1);
    expect(report.newUniqueSocialContacts).toBe(2);

    const agencyMetric = report.strategyMetrics.find(m => m.strategy === 'agency');
    expect(agencyMetric?.accepted).toBe(1);
    expect(agencyMetric?.yieldRate).toBe(100);

    const geoMetric = report.strategyMetrics.find(m => m.strategy === 'geo');
    expect(geoMetric?.noPhone).toBe(1);
  });
});
