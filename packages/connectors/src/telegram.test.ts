import { describe, it, expect } from 'vitest';
import {
  validateTelegramUrl,
  isTelegramRealEstateSource,
  buildTelegramEvidence,
  extractTelegramSourceFromHtml,
  type TelegramSourceData,
} from './telegram';

describe('Telegram Public Real-Estate Connector', () => {
  describe('1. URL Validation', () => {
    it('validates public Telegram channels, groups, and usernames', () => {
      expect(validateTelegramUrl('https://t.me/baku_emlak')).toBe('https://t.me/baku_emlak');
      expect(validateTelegramUrl('t.me/yasamal_rieltor')).toBe('https://t.me/yasamal_rieltor');
      expect(validateTelegramUrl('@grand_estate_baku')).toBe('https://t.me/grand_estate_baku');
      expect(validateTelegramUrl('https://telegram.me/narimanov_menzil')).toBe('https://telegram.me/narimanov_menzil');
    });

    it('rejects invalid or non-telegram URLs', () => {
      expect(() => validateTelegramUrl('https://instagram.com/baku_emlak')).toThrow();
      expect(() => validateTelegramUrl('https://t.me/')).toThrow();
    });
  });

  describe('2. Real Estate Classification & False Positive Protection', () => {
    it('accepts legitimate Azerbaijan realtor channel with public phone', () => {
      const data: TelegramSourceData = {
        username: 'baku_emlak_merkezi',
        title: 'Bakı Əmlak Mərkəzi | Rəsmi Kanal',
        description: 'Bakı şəhərində daşınmaz əmlak alqı-satqısı və kirayəsi. Əlaqə: +994 50 123 45 67',
        isChannel: true,
        publicPhone: '+994501234567',
        posts: [{ text: 'Yasamal rayonunda 3 otaqlı təmirli mənzil satılır. Tel: 050 123 45 67' }],
      };

      const res = isTelegramRealEstateSource(data);
      expect(res.isRealtor).toBe(true);
      expect(res.sellerType).toBe('agency');
      expect(res.isForeign).toBe(false);
      expect(res.isOwner).toBe(false);

      const evidence = buildTelegramEvidence(data);
      expect(evidence.items.length).toBe(1);
      expect(evidence.items[0]?.rawPhone).toBe('+994501234567');
      expect(evidence.items[0]?.explicitSellerType).toBe('agency');
    });

    it('accepts real estate agent profile with WhatsApp link', () => {
      const data: TelegramSourceData = {
        username: 'rieltor_elvin_baku',
        title: 'Elvin Rieltor',
        description: 'Nərimanov və Nəsimi üzrə əmlak agenti. WhatsApp: wa.me/994552223344',
        publicPhone: '+994552223344',
      };

      const res = isTelegramRealEstateSource(data);
      expect(res.isRealtor).toBe(true);
      expect(res.sellerType).toBe('agent');
    });

    it('rejects unrelated public business channels (Beauty, Cars, Crypto)', () => {
      const beautyChannel: TelegramSourceData = {
        username: 'baku_beauty_studio',
        title: 'Baku Beauty Studio',
        description: 'Lazer epilyasiya, saç kəsimi və vizaj xidmətləri. Tel: +994 50 999 88 77',
      };
      expect(isTelegramRealEstateSource(beautyChannel).isRealtor).toBe(false);

      const carChannel: TelegramSourceData = {
        username: 'baku_avtosalon_motors',
        title: 'Baku Avtosalon Motors',
        description: 'Kredit və lizinqlə avtomobil satışı. Əlaqə: +994 55 888 77 66',
      };
      expect(isTelegramRealEstateSource(carChannel).isRealtor).toBe(false);

      const cryptoChannel: TelegramSourceData = {
        username: 'kripto_baku_trading',
        title: 'Kripto Trading Baku',
        description: 'Kriptovalyuta və forex siqnalları. Tel: +994 70 555 44 33',
      };
      expect(isTelegramRealEstateSource(cryptoChannel).isRealtor).toBe(false);
    });

    it('rejects private owner listings without agency context', () => {
      const ownerPost: TelegramSourceData = {
        username: 'oz_evim_baku',
        title: 'Ev Sahibindən Satış',
        description: 'Yasamalda 2 otaqlı ev satıram. Sahibindən, maklerlər qəti narahat etməsin. Tel: +994 50 333 22 11',
      };

      const res = isTelegramRealEstateSource(ownerPost);
      expect(res.isRealtor).toBe(false);
      expect(res.isOwner).toBe(true);
      expect(res.sellerType).toBe('owner');

      const evidence = buildTelegramEvidence(ownerPost);
      expect(evidence.items.length).toBe(0);
    });

    it('rejects foreign real estate channels (Turkey +90, Russia +7)', () => {
      const trChannel: TelegramSourceData = {
        username: 'istanbul_emlak_duyuru',
        title: 'Istanbul Emlak & Yatirim',
        description: 'Kadikoy satilik daireler. WhatsApp: +90 532 111 22 33',
        publicPhone: '+905321112233',
      };
      const trRes = isTelegramRealEstateSource(trChannel);
      expect(trRes.isRealtor).toBe(false);
      expect(trRes.isForeign).toBe(true);

      const ruChannel: TelegramSourceData = {
        username: 'moscow_nedvizhimost_pro',
        title: 'Недвижимость Москва',
        description: 'Квартиры в новостройках Москвы. Тел: +7 926 111 22 33',
        publicPhone: '+79261112233',
      };
      const ruRes = isTelegramRealEstateSource(ruChannel);
      expect(ruRes.isRealtor).toBe(false);
      expect(ruRes.isForeign).toBe(true);
    });

    it('handles valid realtor without public phone safely (no phantom evidence)', () => {
      const noPhoneChannel: TelegramSourceData = {
        username: 'baku_emlak_direct',
        title: 'Baku Emlak Kanalı',
        description: 'Bakı üzrə daşınmaz əmlak elanları. Əlaqə üçün yalnız şəxsiyə yazın.',
      };
      const res = isTelegramRealEstateSource(noPhoneChannel);
      expect(res.isRealtor).toBe(true);

      const evidence = buildTelegramEvidence(noPhoneChannel);
      expect(evidence.items.length).toBe(0); // No phantom contact created!
    });
  });

  describe('3. HTML Parser & Public Preview Extraction', () => {
    it('extracts public channel data from Telegram preview HTML', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="EVA Group Əmlak Agentliyi">
          <meta property="og:description" content="Bakı və Abşeron üzrə daşınmaz əmlak. Tel: 050 777 88 99">
        </head>
        <body>
          <div class="tgme_page_title">EVA Group Əmlak Agentliyi</div>
          <div class="tgme_page_extra">5,240 subscribers</div>
          <div class="tgme_page_description">Bakı və Abşeron üzrə daşınmaz əmlak. Tel: 050 777 88 99</div>
          <div class="tgme_widget_message_text">Yeni Yasamalda 3 otaq mənzil satılır. Əlaqə: 050 777 88 99</div>
        </body>
        </html>
      `;

      const parsed = extractTelegramSourceFromHtml(sampleHtml, 'https://t.me/eva_group_emlak');
      expect(parsed).not.toBeNull();
      expect(parsed?.username).toBe('eva_group_emlak');
      expect(parsed?.title).toBe('EVA Group Əmlak Agentliyi');
      expect(parsed?.isChannel).toBe(true);
      expect(parsed?.posts?.length).toBe(1);
    });
  });
});
