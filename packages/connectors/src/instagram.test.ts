import { describe, it, expect } from 'vitest';
import {
  validateInstagramUrl,
  isInstagramRealEstateProfile,
  detectExplicitInstagramSellerType,
  extractPhonesFromInstagramProfile,
  parseInstagramProfileData,
  extractInstagramProfileFromHtml,
  crawlInstagram,
  type InstagramProfileData,
} from './instagram';

describe('Instagram Connector', () => {
  it('validates valid and invalid Instagram URLs', () => {
    expect(validateInstagramUrl('https://www.instagram.com/baku_emlak_agent')).toBe('https://www.instagram.com/baku_emlak_agent');
    expect(validateInstagramUrl('https://instagram.com/rieltor_baku/')).toBe('https://instagram.com/rieltor_baku/');

    expect(() => validateInstagramUrl('https://facebook.com/realtor')).toThrow('not a valid Instagram host');
    expect(() => validateInstagramUrl('https://instagram.com/p/C123456', 'profile')).toThrow('not a valid Instagram profile path');
  });

  it('correctly classifies real estate profiles (AZ, RU, EN)', () => {
    // AZ Realtor
    expect(
      isInstagramRealEstateProfile({
        username: 'elmir_emlak_baku',
        fullName: 'Elmir Məmmədov',
        biography: 'Bakıda mənzil satışı və kirayəsi. Daşınmaz əmlak agentliyi. Əlaqə: 050 123 45 67',
      })
    ).toBe(true);

    // RU Agency
    expect(
      isInstagramRealEstateProfile({
        username: 'grand_estate_baku',
        fullName: 'Grand Estate Baku',
        biography: 'Агентство недвижимости в Баку. Продажа и аренда элитных квартир.',
        businessCategory: 'Real Estate Agency',
      })
    ).toBe(true);

    // EN Realtor
    expect(
      isInstagramRealEstateProfile({
        username: 'baku_realtor_official',
        fullName: 'Baku Real Estate Agent',
        biography: 'Professional property agent in Baku. Apartments for sale and rent.',
      })
    ).toBe(true);
  });

  it('strictly rejects unrelated business profiles (auto, salon, food, clothes)', () => {
    // Auto dealership
    expect(
      isInstagramRealEstateProfile({
        username: 'baku_avto_salon',
        fullName: 'Baku Avto Salon',
        biography: 'Hər növ avtomobillərin alqı-satqısı. Maşın bazarı. Əlaqə: 055 999 88 77',
      })
    ).toBe(false);

    // Beauty Salon
    expect(
      isInstagramRealEstateProfile({
        username: 'beauty_salon_baku',
        fullName: 'Gözəllik Salonu',
        biography: 'Saç kəsimi, vizaj, manikür. Əlaqə: 070 111 22 33',
        businessCategory: 'Beauty Salon',
      })
    ).toBe(false);

    // Restaurant / Food
    expect(
      isInstagramRealEstateProfile({
        username: 'baku_doner_kafe',
        fullName: 'Baku Dönər & Kafe',
        biography: 'Dadlı yeməklər və çatdırılma xidməti. 012 444 55 66',
      })
    ).toBe(false);

    // Phone store
    expect(
      isInstagramRealEstateProfile({
        username: 'istore_baku',
        fullName: 'iPhone Satışı Bakı',
        biography: 'Orijinal smartfonlar və aksesuarlar. 051 222 33 44',
      })
    ).toBe(false);
  });

  it('detects seller types accurately', () => {
    expect(
      detectExplicitInstagramSellerType({
        username: 'baku_emlak_agency',
        fullName: 'Quliyev Emlak Agentliyi',
        biography: 'Daşınmaz əmlak agentliyi',
      })
    ).toBe('agency');

    expect(
      detectExplicitInstagramSellerType({
        username: 'rieltor_samir',
        fullName: 'Samir Rieltor',
        biography: 'Rieltor xidmətləri',
      })
    ).toBe('agent');

    expect(
      detectExplicitInstagramSellerType({
        username: 'mamed_evim',
        biography: 'Öz evimi satıram. Mülkiyyətçiyəm. Maklerlər narahat etməsin.',
      })
    ).toBe('owner');
  });

  it('extracts and normalizes phone numbers from bio and posts', () => {
    const profile: InstagramProfileData = {
      username: 'baku_emlak',
      fullName: 'Baku Emlak',
      biography: 'Mənzil satışı. WhatsApp: +994 (55) 712-31-56 və ya 050 791 36 30',
    };

    const phones = extractPhonesFromInstagramProfile(profile);
    expect(phones).toContain('+994557123156');
    expect(phones).toContain('+994507913630');
  });

  it('parses valid profile into ConnectorEvidence', () => {
    const profile: InstagramProfileData = {
      username: 'eva_group_baku',
      fullName: 'EVA Group "Şans Əmlak"',
      biography: 'Bakıda daşınmaz əmlak alqı-satqısı. Əlaqə: 070 234 74 54',
      businessCategory: 'Real Estate Agency',
      isBusinessAccount: true,
    };

    const evidence = parseInstagramProfileData(profile, 'https://www.instagram.com/eva_group_baku/');
    expect(evidence).not.toBeNull();
    expect(evidence?.platform).toBe('instagram');
    expect(evidence?.username).toBe('eva_group_baku');
    expect(evidence?.rawPhone).toBe('+994702347454');
    expect(evidence?.name).toBe('EVA Group "Şans Əmlak"');
    expect(evidence?.explicitSellerType).toBe('agency');
  });

  it('rejects profiles without phone number or owner profiles', () => {
    const noPhoneProfile: InstagramProfileData = {
      username: 'realtor_no_phone',
      fullName: 'Rieltor Əhməd',
      biography: 'Mənzil satışı və kirayəsi. Direct-ə yazın.',
    };

    const ownerProfile: InstagramProfileData = {
      username: 'owner_baku',
      fullName: 'Mülkiyyətçi Əli',
      biography: 'Öz evimi satıram. Sahibindən mənzil. Tel: 050 123 45 67',
    };

    expect(parseInstagramProfileData(noPhoneProfile, 'https://www.instagram.com/realtor_no_phone/')).toBeNull();
    expect(parseInstagramProfileData(ownerProfile, 'https://www.instagram.com/owner_baku/')).toBeNull();
  });

  it('extracts profile data from public HTML meta tags', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Bakı Əmlak Agentliyi (@baku_emlak_agent) • Instagram photos and videos</title>
          <meta property="og:title" content="Bakı Əmlak Agentliyi (@baku_emlak_agent) • Instagram photos and videos">
          <meta property="og:description" content="1,200 Followers, 350 Following, 85 Posts - See Instagram photos and videos from Bakı Əmlak Agentliyi: &quot;Bakıda mənzil alqı-satqısı və kirayəsi. Əlaqə: 050 791 36 30&quot;">
        </head>
        <body></body>
      </html>
    `;

    const profile = extractInstagramProfileFromHtml(html, 'https://www.instagram.com/baku_emlak_agent/');
    expect(profile).not.toBeNull();
    expect(profile?.username).toBe('baku_emlak_agent');
    expect(profile?.fullName).toBe('Bakı Əmlak Agentliyi');
    expect(profile?.biography).toContain('050 791 36 30');

    const evidence = parseInstagramProfileData(profile!, 'https://www.instagram.com/baku_emlak_agent/');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('+994507913630');
    expect(evidence?.explicitSellerType).toBe('agency');
  });

  it('runs crawlInstagram with mock fetcher', async () => {
    const html = `
      <title>Quliyev Estates (@quliyev_estates) • Instagram</title>
      <meta property="og:title" content="Quliyev Estates (@quliyev_estates)">
      <meta property="og:description" content="Daşınmaz əmlak agentliyi. Mənzil satışı. Tel: 050 791 36 30">
    `;

    const mockFetcher = () => {
      return Promise.resolve(new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlInstagram(
      { startUrl: 'https://www.instagram.com/quliyev_estates', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('+994507913630');
    expect(result.items[0]?.username).toBe('quliyev_estates');
  });
});
