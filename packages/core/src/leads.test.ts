import { describe, it, expect } from 'vitest';
import {
  classifyLeadIntent,
  extractLeadGeo,
  extractPropertyType,
  extractRooms,
  extractBudget,
} from './leads';

describe('Lead Intelligence Classifier', () => {
  describe('1. Buyer Intent Classification', () => {
    it('classifies Azerbaijani buyer with geo, rooms, budget', () => {
      const text = 'Yasamal rayonunda 3 otaqlı mənzil axtarıram, büdcə 220 min AZN';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('buyer');
      expect(res.district).toBe('Yasamal');
      expect(res.propertyType).toBe('apartment');
      expect(res.rooms).toBe(3);
      expect(res.budgetMax).toBe(220000);
      expect(res.currency).toBe('AZN');
      expect(res.confidenceLevel).toBe('high');
      expect(res.isRealtorSender).toBe(false);
    });

    it('classifies Russian buyer with metro and price limit', () => {
      const text = 'Ищу 2-комнатную квартиру около метро Гянджлик до 180 000 AZN';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('buyer');
      expect(res.metro).toBe('Gənclik');
      expect(res.propertyType).toBe('apartment');
      expect(res.rooms).toBe(2);
      expect(res.budgetMax).toBe(180000);
      expect(res.confidenceLevel).toBe('high');
    });

    it('classifies English buyer', () => {
      const text = 'Want to buy a 3 bedroom house in Baku';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('buyer');
      expect(res.propertyType).toBe('house');
      expect(res.rooms).toBe(3);
    });
  });

  describe('2. Seller Intent & Owner Distinction', () => {
    it('classifies owner seller post as seller lead (even with anti-realtor phrase)', () => {
      const text = 'Öz evimdir, satıram, Yasamalda 2 otaqlı mənzil. Maklerlər narahat etməsin. Tel: 050 333 44 55';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('seller');
      expect(res.district).toBe('Yasamal');
      expect(res.rooms).toBe(2);
    });

    it('classifies Russian owner seller', () => {
      const text = 'Собственник, продаю 3-комнатную квартиру в Нариманове, без посредников';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('seller');
      expect(res.district).toBe('Nərimanov');
    });
  });

  describe('3. Renter & Landlord Intent', () => {
    it('classifies renter request', () => {
      const text = 'Nəsimi rayonunda kirayə mənzil axtarıram, aylıq büdcə 800 AZN';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('renter');
      expect(res.district).toBe('Nəsimi');
      expect(res.budgetMax).toBe(800);
    });

    it('classifies landlord offering rental', () => {
      const text = '28 May metrosu yanında 2 otaqlı mənzil kirayə verirəm, qiymət 1200 AZN';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('landlord');
      expect(res.metro).toBe('28 May');
      expect(res.budgetMax).toBe(1200);
    });
  });

  describe('4. Investor & Realtor Request Distinction', () => {
    it('classifies investor intent', () => {
      const text = 'Bakıda investisiya üçün gəlirli kommersiya obyekti axtarıram';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('investor');
      expect(res.propertyType).toBe('commercial');
    });

    it('distinguishes realtor looking on behalf of client (realtor_request)', () => {
      const text = 'Müştəri üçün Nərimanovda 2 otaqlı təmirli mənzil axtarırıq, büdcə 200 min';
      const res = classifyLeadIntent(text);
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('realtor_request');
      expect(res.isRealtorSender).toBe(true);
    });

    it('flags known canonical realtor sender correctly', () => {
      const knownPhones = new Set(['+994501234567']);
      const text = 'Yasamalda 2 otaq mənzil lazımdır';
      const res = classifyLeadIntent(text, { senderPhone: '+994501234567', knownRealtorPhones: knownPhones });
      expect(res.isRealtorSender).toBe(true);
    });
  });

  describe('5. Question Intent & Noise Rejection', () => {
    it('classifies price question in property context as buyer candidate', () => {
      const parentPost = 'Nərimanovda 3 otaqlı yeni tikili satılır';
      const comment = 'Qiyməti nə qədərdir? İpoteka var?';
      const res = classifyLeadIntent(comment, { parentContext: parentPost });
      expect(res.isLead).toBe(true);
      expect(res.leadType).toBe('buyer');
      expect(res.district).toBe('Nərimanov');
    });

    it('rejects generic non-lead comments', () => {
      expect(classifyLeadIntent('Super mənzildir, halal olsun').isLead).toBe(false);
      expect(classifyLeadIntent('🔥🔥🔥').isLead).toBe(false);
      expect(classifyLeadIntent('Salam').isLead).toBe(false);
    });
  });

  describe('6. Entity Extractors', () => {
    it('extracts geo, metro, district correctly', () => {
      expect(extractLeadGeo('Elmlər metrosu yanında ev').metro).toBe('Elmlər Akademiyası');
      expect(extractLeadGeo('Xətai rayonunda mənzil').district).toBe('Xətai');
      expect(extractLeadGeo('Sumqayıt şəhərində').city).toBe('Sumqayıt');
    });

    it('extracts property types accurately', () => {
      expect(extractPropertyType('Yeni tikili bina evi')).toBe('apartment');
      expect(extractPropertyType('Bağ evi və villa')).toBe('villa');
      expect(extractPropertyType('Həyət evi satılır')).toBe('house');
      expect(extractPropertyType('Ofis icarəyə verilir')).toBe('commercial');
      expect(extractPropertyType('Torpaq sahəsi 6 sot')).toBe('land');
    });

    it('extracts rooms accurately', () => {
      expect(extractRooms('3 otaqlı təmirli')).toBe(3);
      expect(extractRooms('2-комнатная квартира')).toBe(2);
      expect(extractRooms('4 room villa')).toBe(4);
    });

    it('extracts budget and currencies', () => {
      const b1 = extractBudget('büdcə 150-200 min AZN');
      expect(b1.budgetMin).toBe(150000);
      expect(b1.budgetMax).toBe(200000);
      expect(b1.currency).toBe('AZN');

      const b2 = extractBudget('up to 1200 $');
      expect(b2.budgetMax).toBe(1200);
      expect(b2.currency).toBe('USD');
    });
  });
});
