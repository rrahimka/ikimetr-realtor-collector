import { describe, it, expect } from 'vitest';
import {
  processSocialScaleBatch,
  generateProgrammaticSeeds,
  DiscoveryLedger,
  type SocialDiscoveryCandidate,
  AZ_CITIES,
  BAKU_DISTRICTS,
  BAKU_METRO_AREAS,
  KNOWN_AZ_AGENCIES,
  REAL_ESTATE_HASHTAGS,
} from './social-scale';

describe('Social Scale-Up Engine & Discovery Optimization', () => {
  it('covers major Azerbaijan cities, Baku districts, and metro areas', () => {
    expect(AZ_CITIES).toContain('Bakı');
    expect(AZ_CITIES).toContain('Sumqayıt');
    expect(AZ_CITIES).toContain('Gəncə');
    expect(AZ_CITIES).toContain('Xırdalan');

    expect(BAKU_DISTRICTS).toContain('Nərimanov');
    expect(BAKU_DISTRICTS).toContain('Yasamal');
    expect(BAKU_DISTRICTS).toContain('Nəsimi');
    expect(BAKU_DISTRICTS).toContain('Xətai');

    expect(BAKU_METRO_AREAS).toContain('28 May');
    expect(BAKU_METRO_AREAS).toContain('Elmlər Akademiyası');
    expect(BAKU_METRO_AREAS).toContain('Neftçilər');
  });

  it('generates rich programmatic search seeds across all strategies and languages', () => {
    const seeds = generateProgrammaticSeeds();
    expect(seeds.length).toBeGreaterThan(50);

    const agencySeeds = seeds.filter(s => s.strategy === 'agency');
    expect(agencySeeds.length).toBe(KNOWN_AZ_AGENCIES.length);

    const geoSeeds = seeds.filter(s => s.strategy === 'geo');
    expect(geoSeeds.length).toBeGreaterThan(20);

    const hashtagSeeds = seeds.filter(s => s.strategy === 'hashtag');
    expect(hashtagSeeds.length).toBe(REAL_ESTATE_HASHTAGS.length);

    const keywordSeeds = seeds.filter(s => s.strategy === 'keyword');
    expect(keywordSeeds.length).toBeGreaterThan(5);
  });

  it('tracks processed candidates via DiscoveryLedger to prevent redundant re-crawling', () => {
    const ledger = new DiscoveryLedger();
    expect(ledger.isAlreadyProcessed('instagram', 'quliyev_estates')).toBe(false);

    ledger.record('instagram', 'quliyev_estates', 'accepted');
    expect(ledger.isAlreadyProcessed('instagram', 'quliyev_estates')).toBe(true);
    expect(ledger.isAlreadyProcessed('instagram', 'QULIYEV_ESTATES')).toBe(true); // case-insensitive
    expect(ledger.isAlreadyProcessed('tiktok', 'quliyev_estates')).toBe(false); // platform-isolated
  });

  it('computes both Database-Growth Yield and Enrichment Yield separately', () => {
    const existingPhones = new Set(['+994507913630']); // existing website contact

    const batch: SocialDiscoveryCandidate[] = [
      // 1. Existing website match (Enrichment)
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
      // 2. New unique IG agency (Database Growth)
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
      // 3. New unique TikTok realtor from hashtag (Database Growth)
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
    expect(report.validRealtorNoPhone).toBe(1);
    expect(report.rejectedUnrelated).toBe(1);

    const agencyMetric = report.strategyMetrics.find(m => m.strategy === 'agency');
    expect(agencyMetric?.newUniqueYield).toBe(100);
    expect(agencyMetric?.enrichmentYield).toBe(0);

    const matchMetric = report.strategyMetrics.find(m => m.strategy === 'website_cross_match');
    expect(matchMetric?.newUniqueYield).toBe(0);
    expect(matchMetric?.enrichmentYield).toBe(100);

    expect(report.bestGrowthStrategy).toBe('agency');
    expect(report.bestEnrichmentStrategy).toBe('website_cross_match');
  });

  it('supports crash recovery simulation by resuming with ledger without duplicating records', () => {
    const existingPhones = new Set<string>();
    const ledger = new DiscoveryLedger();

    const candidate: SocialDiscoveryCandidate = {
      platform: 'instagram',
      strategy: 'agency',
      seed: 'EVA Group',
      url: 'https://instagram.com/eva_group_baku',
      username: 'eva_group_baku',
      data: {
        username: 'eva_group_baku',
        fullName: 'EVA Group "Şans Əmlak"',
        biography: 'Daşınmaz əmlak agentliyi. Tel: +994702347454',
        publicPhone: '+994702347454',
      },
    };

    // First batch
    const report1 = processSocialScaleBatch([candidate], existingPhones, ledger);
    expect(report1.totalAccepted).toBe(1);
    expect(ledger.isAlreadyProcessed('instagram', 'eva_group_baku')).toBe(true);

    // Resumed second batch with same candidate
    const report2 = processSocialScaleBatch([candidate], existingPhones, ledger);
    expect(report2.totalChecked).toBe(0); // Skipped because already in ledger!
    expect(report2.totalAccepted).toBe(0);
  });
});
