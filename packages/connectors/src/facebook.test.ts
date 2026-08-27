import { describe, it, expect } from 'vitest';
import {
  validateFacebookUrl,
  isFacebookRealEstatePage,
  buildFacebookEvidence,
  extractFacebookPageFromHtml,
  type FacebookPageData,
} from './facebook';

describe('Facebook Public Business Pages Connector', () => {
  describe('1. URL Validation', () => {
    it('validates public Facebook page URLs', () => {
      expect(validateFacebookUrl('https://www.facebook.com/baku.emlak')).toBe('https://www.facebook.com/baku.emlak');
      expect(validateFacebookUrl('https://fb.com/yasamal_rieltor')).toBe('https://fb.com/yasamal_rieltor');
      expect(validateFacebookUrl('facebook.com/grand.estate.baku')).toBe('https://facebook.com/grand.estate.baku');
    });

    it('rejects invalid or non-facebook URLs', () => {
      expect(() => validateFacebookUrl('https://google.com')).toThrow();
      expect(() => validateFacebookUrl('https://facebook.com/')).toThrow();
    });
  });

  describe('2. Real Estate Classification & False Positive Protection', () => {
    it('accepts legitimate Azerbaijan real estate agency page with public phone', () => {
      const data: FacebookPageData = {
        username: 'baku_premium_emlak',
        pageTitle: 'Bakı Premium Əmlak Agentliyi',
        about: 'Bakı şəhərində lüks mənzillər və villaların satışı. Əlaqə: +994 50 222 33 44',
        businessCategory: 'Real Estate Agency',
        publicPhone: '+994502223344',
        posts: [{ text: 'Nəsimi rayonunda dəniz mənzərəli 4 otaqlı mənzil. Tel: 050 222 33 44' }],
      };

      const res = isFacebookRealEstatePage(data);
      expect(res.isRealtor).toBe(true);
      expect(res.sellerType).toBe('agency');
      expect(res.isForeign).toBe(false);
      expect(res.isOwner).toBe(false);

      const evidence = buildFacebookEvidence(data);
      expect(evidence.items.length).toBe(1);
      expect(evidence.items[0]?.rawPhone).toBe('+994502223344');
      expect(evidence.items[0]?.explicitSellerType).toBe('agency');
      expect(evidence.items[0]?.platform).toBe('facebook');
    });

    it('accepts professional realtor page', () => {
      const data: FacebookPageData = {
        username: 'rieltor_rashad_baku',
        pageTitle: 'Rəşad Əliyev - Daşınmaz Əmlak Mütəxəssisi',
        about: 'Yasamal və Nərimanov rayonlarında mənzil alqı-satqısı. WhatsApp: +994 55 333 44 55',
        businessCategory: 'Real Estate Agent',
        publicPhone: '+994553334455',
      };

      const res = isFacebookRealEstatePage(data);
      expect(res.isRealtor).toBe(true);
      expect(res.sellerType).toBe('agent');
    });

    it('rejects unrelated business pages (Beauty, Auto, Tourism, Renovation)', () => {
      const beautyPage: FacebookPageData = {
        username: 'baku_beauty_spa',
        pageTitle: 'Baku Beauty & Spa Lounge',
        about: 'Lazer epilyasiya, dırnaq qulluğu və masaj. Tel: +994 50 111 22 33',
        businessCategory: 'Beauty Salon',
      };
      expect(isFacebookRealEstatePage(beautyPage).isRealtor).toBe(false);

      const autoPage: FacebookPageData = {
        username: 'baku_cars_auto',
        pageTitle: 'Baku Cars Motors',
        about: 'Avtomobillərin nağd və kreditlə satışı. Tel: +994 55 444 55 66',
        businessCategory: 'Car Dealership',
      };
      expect(isFacebookRealEstatePage(autoPage).isRealtor).toBe(false);

      const travelPage: FacebookPageData = {
        username: 'baku_travel_tourism',
        pageTitle: 'Baku Travel Agency',
        about: 'Xaricə turlar və aviabiletlər. Tel: +994 70 777 88 99',
        businessCategory: 'Travel Agency',
      };
      expect(isFacebookRealEstatePage(travelPage).isRealtor).toBe(false);
    });

    it('rejects private owner listings', () => {
      const ownerPage: FacebookPageData = {
        username: 'oz_evim_satiram',
        pageTitle: 'Ev Sahibindən Mənzillər',
        about: 'Öz evimdir, maklerlər narahat etməsin. Tel: +994 50 999 00 11',
      };

      const res = isFacebookRealEstatePage(ownerPage);
      expect(res.isRealtor).toBe(false);
      expect(res.isOwner).toBe(true);
      expect(res.sellerType).toBe('owner');

      const evidence = buildFacebookEvidence(ownerPage);
      expect(evidence.items.length).toBe(0);
    });

    it('rejects foreign real estate pages (Turkey +90, Russia +7, UAE +971)', () => {
      const trPage: FacebookPageData = {
        username: 'antalya_emlak_gayrimenkul',
        pageTitle: 'Antalya Emlak & Gayrimenkul',
        about: 'Alanya ve Lara satilik villalar. WhatsApp: +90 532 888 77 66',
        publicPhone: '+905328887766',
      };
      const trRes = isFacebookRealEstatePage(trPage);
      expect(trRes.isRealtor).toBe(false);
      expect(trRes.isForeign).toBe(true);

      const uaePage: FacebookPageData = {
        username: 'dubai_luxury_properties',
        pageTitle: 'Dubai Luxury Real Estate',
        about: 'Downtown Dubai luxury apartments. Tel: +971 50 123 4567',
        publicPhone: '+971501234567',
      };
      const uaeRes = isFacebookRealEstatePage(uaePage);
      expect(uaeRes.isRealtor).toBe(false);
      expect(uaeRes.isForeign).toBe(true);
    });

    it('handles valid realtor without phone safely without phantom contacts', () => {
      const noPhonePage: FacebookPageData = {
        username: 'baku_realty_messenger_only',
        pageTitle: 'Baku Realty Page',
        about: 'Bakı üzrə daşınmaz əmlak konsultasiyası. Bizimlə Messenger vasitəsilə əlaqə saxlayın.',
        businessCategory: 'Real Estate Agent',
      };
      const res = isFacebookRealEstatePage(noPhonePage);
      expect(res.isRealtor).toBe(true);

      const evidence = buildFacebookEvidence(noPhonePage);
      expect(evidence.items.length).toBe(0);
    });
  });

  describe('3. HTML Parser & Preview Extraction', () => {
    it('extracts page details from preview HTML', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="ADAM Estate Daşınmaz Əmlak">
          <meta property="og:description" content="Bakı şəhərində mənzillərin alqı-satqısı. Tel: 050 555 66 77">
        </head>
        <body>
          <h1>ADAM Estate Daşınmaz Əmlak</h1>
        </body>
        </html>
      `;

      const parsed = extractFacebookPageFromHtml(sampleHtml, 'https://www.facebook.com/adam.estate.baku');
      expect(parsed).not.toBeNull();
      expect(parsed?.username).toBe('adam.estate.baku');
      expect(parsed?.pageTitle).toBe('ADAM Estate Daşınmaz Əmlak');
      expect(parsed?.about).toContain('050 555 66 77');
    });
  });
});
