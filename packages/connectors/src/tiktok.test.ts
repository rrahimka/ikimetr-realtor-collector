import { describe, it, expect } from 'vitest';
import {
  validateTikTokUrl,
  isTikTokRealEstateProfile,
  detectExplicitTikTokSellerType,
  extractPhonesFromTikTokProfile,
  parseTikTokProfileData,
  extractTikTokProfileFromHtml,
  crawlTikTok,
  type TikTokProfileData,
} from './tiktok';

describe('TikTok Connector', () => {
  it('validates valid and invalid TikTok URLs', () => {
    expect(validateTikTokUrl('https://www.tiktok.com/@baku_emlak_makler')).toBe('https://www.tiktok.com/@baku_emlak_makler');
    expect(validateTikTokUrl('https://tiktok.com/@rieltor.baku')).toBe('https://tiktok.com/@rieltor.baku');

    expect(() => validateTikTokUrl('https://youtube.com/@realtor')).toThrow('not a valid TikTok host');
    expect(() => validateTikTokUrl('https://tiktok.com/video/123456', 'profile')).toThrow('not a valid TikTok profile path');
  });

  it('correctly classifies real estate TikTok profiles (AZ, RU, EN)', () => {
    // AZ Realtor
    expect(
      isTikTokRealEstateProfile({
        username: 'emlakci_elnur',
        nickname: 'Elnur Rieltor',
        signature: 'Bakıda mənzillərin və torpaq sahələrinin satışı. Daşınmaz əmlak agentliyi. 050 333 44 55',
      })
    ).toBe(true);

    // RU Realtor with video captions
    expect(
      isTikTokRealEstateProfile({
        username: 'realtor_baku_estate',
        nickname: 'Недвижимость Баку',
        signature: 'Покупка и аренда квартир в Баку.',
        videos: [
          { desc: 'Новостройка на 28 Мая, 3 комнаты, евроремонт #недвижимостьбаку' },
          { desc: 'Продажа виллы в Мардакянах #риелтор' },
        ],
      })
    ).toBe(true);

    // EN Real Estate Agency
    expect(
      isTikTokRealEstateProfile({
        username: 'baku_properties',
        nickname: 'Baku Real Estate Agency',
        signature: 'Luxury properties and apartments for sale in Baku. Contact: +994507913630',
      })
    ).toBe(true);
  });

  it('strictly rejects unrelated TikTok profiles (gaming, dancing, auto, beauty)', () => {
    // Gamer
    expect(
      isTikTokRealEstateProfile({
        username: 'pubg_baku_pro',
        nickname: 'PUBG Baku Player',
        signature: 'Gaming videos and tournaments. Əlaqə: 050 123 45 67',
      })
    ).toBe(false);

    // Dancer
    expect(
      isTikTokRealEstateProfile({
        username: 'dance_studio_az',
        nickname: 'Milli Rəqslər',
        signature: 'Toy və bayram rəqsləri. Əlaqə: 070 999 88 77',
      })
    ).toBe(false);

    // Auto store
    expect(
      isTikTokRealEstateProfile({
        username: 'baku_avto_tuning',
        nickname: 'Avto Tuning',
        signature: 'Maşın aksesuarları və tüninq. 055 444 33 22',
      })
    ).toBe(false);

    // Beauty / Salon
    expect(
      isTikTokRealEstateProfile({
        username: 'salon_baku',
        nickname: 'Gözəllik Salonu',
        signature: 'Vizaj və saç düzümü. 012 333 22 11',
      })
    ).toBe(false);
  });

  it('detects seller types accurately', () => {
    expect(
      detectExplicitTikTokSellerType({
        username: 'royal_estate_baku',
        nickname: 'Royal Estate Agency',
        signature: 'Daşınmaz əmlak agentliyi',
      })
    ).toBe('agency');

    expect(
      detectExplicitTikTokSellerType({
        username: 'makler_resad',
        nickname: 'Rəşad Makler',
        signature: 'Rieltor xidmətləri',
      })
    ).toBe('agent');

    expect(
      detectExplicitTikTokSellerType({
        username: 'sahibinden_menzil',
        signature: 'Öz mənzilimi satıram. Mülkiyyətçiyəm.',
      })
    ).toBe('owner');
  });

  it('extracts and normalizes phone numbers from signature and bioLink', () => {
    const profile: TikTokProfileData = {
      username: 'baku_makler',
      nickname: 'Baku Makler',
      signature: 'Mənzil satışı. WhatsApp: 070 234 74 54 və ya +994504472727',
    };

    const phones = extractPhonesFromTikTokProfile(profile);
    expect(phones).toContain('+994702347454');
    expect(phones).toContain('+994504472727');
  });

  it('parses valid profile into ConnectorEvidence', () => {
    const profile: TikTokProfileData = {
      username: 'baku_emlak_dostluq',
      nickname: 'Bakı Əmlak Dostluq',
      signature: 'Daşınmaz əmlak alqı-satqısı və kirayəsi. Tel: 051 270 33 14',
      isCommerceUser: true,
    };

    const evidence = parseTikTokProfileData(profile, 'https://www.tiktok.com/@baku_emlak_dostluq');
    expect(evidence).not.toBeNull();
    expect(evidence?.platform).toBe('tiktok');
    expect(evidence?.username).toBe('baku_emlak_dostluq');
    expect(evidence?.rawPhone).toBe('+994512703314');
    expect(evidence?.name).toBe('Bakı Əmlak Dostluq');
    expect(evidence?.explicitSellerType).toBe('agent');
  });

  it('extracts profile data from JSON state or meta tags', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Arif Rieltor (@arif_rieltor) | TikTok</title>
          <meta property="og:title" content="Arif Rieltor (@arif_rieltor) | TikTok">
          <meta property="og:description" content="Mənzillərin alqı-satqısı. Daşınmaz əmlak agenti. Tel: 055 222 92 92">
        </head>
        <body></body>
      </html>
    `;

    const profile = extractTikTokProfileFromHtml(html, 'https://www.tiktok.com/@arif_rieltor');
    expect(profile).not.toBeNull();
    expect(profile?.username).toBe('arif_rieltor');
    expect(profile?.nickname).toBe('Arif Rieltor');
    expect(profile?.signature).toContain('055 222 92 92');

    const evidence = parseTikTokProfileData(profile!, 'https://www.tiktok.com/@arif_rieltor');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('+994552229292');
  });

  it('runs crawlTikTok with mock fetcher', async () => {
    const html = `
      <title>EVA Group (@eva_group_baku) | TikTok</title>
      <meta property="og:title" content="EVA Group (@eva_group_baku)">
      <meta property="og:description" content="Daşınmaz əmlak agentliyi. Mənzil satışı. Tel: 070 234 74 54">
    `;

    const mockFetcher = () => {
      return Promise.resolve(new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlTikTok(
      { startUrl: 'https://www.tiktok.com/@eva_group_baku', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('+994702347454');
    expect(result.items[0]?.username).toBe('eva_group_baku');
  });
});
