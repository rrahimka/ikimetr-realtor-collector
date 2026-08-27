import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@ikimetr/core';
import {
  isInstagramRealEstateProfile,
  parseInstagramProfileData,
  type InstagramProfileData,
} from './instagram';
import {
  isTikTokRealEstateProfile,
  parseTikTokProfileData,
  type TikTokProfileData,
} from './tiktok';

describe('Social Quality Gate & Safety Verification', () => {
  describe('1. False Positive Protection', () => {
    it('rejects Instagram business/pro accounts outside real estate even if they have a phone and business category', () => {
      const proAuto: InstagramProfileData = {
        username: 'baku_auto_lux',
        fullName: 'Baku Auto Lux Store',
        biography: 'Avtosalon, maşın satışı, lizinq xidməti. Əlaqə: 050 111 22 33',
        businessCategory: 'Car Dealership',
        isBusinessAccount: true,
        publicPhone: '+994501112233',
      };
      expect(isInstagramRealEstateProfile(proAuto)).toBe(false);
      expect(parseInstagramProfileData(proAuto, 'https://instagram.com/baku_auto_lux')).toBeNull();

      const proBeauty: InstagramProfileData = {
        username: 'aygun_beauty_baku',
        fullName: 'Aygün Vizajist',
        biography: 'Gözəllik salonu, vizaj və saç düzümü. WhatsApp: 055 444 33 22',
        businessCategory: 'Beauty, Cosmetic & Personal Care',
        isBusinessAccount: true,
        publicPhone: '+994554443322',
      };
      expect(isInstagramRealEstateProfile(proBeauty)).toBe(false);
      expect(parseInstagramProfileData(proBeauty, 'https://instagram.com/aygun_beauty_baku')).toBeNull();

      const proRestaurant: InstagramProfileData = {
        username: 'baku_lounge_cafe',
        fullName: 'Baku Lounge & Restaurant',
        biography: 'Ləziz təamlar və çatdırılma. Rezerv: 012 555 66 77',
        businessCategory: 'Restaurant',
        isBusinessAccount: true,
      };
      expect(isInstagramRealEstateProfile(proRestaurant)).toBe(false);
      expect(parseInstagramProfileData(proRestaurant, 'https://instagram.com/baku_lounge_cafe')).toBeNull();
    });

    it('rejects TikTok commerce/pro accounts outside real estate even with verified phone', () => {
      const tkStore: TikTokProfileData = {
        username: 'baku_phone_shop',
        nickname: 'Smartfon Satışı',
        signature: 'Orijinal telefonlar və aksesuarlar. Çatdırılma var. Tel: 070 999 88 77',
        isCommerceUser: true,
        category: 'Electronics Store',
        publicPhone: '+994709998877',
      };
      expect(isTikTokRealEstateProfile(tkStore)).toBe(false);
      expect(parseTikTokProfileData(tkStore, 'https://tiktok.com/@baku_phone_shop')).toBeNull();

      const tkGamer: TikTokProfileData = {
        username: 'pubg_baku_champ',
        nickname: 'PUBG Baku Player',
        signature: 'Turnirlər və canlı yayımlar. Əlaqə üçün WhatsApp: 050 333 22 11',
        isCommerceUser: false,
      };
      expect(isTikTokRealEstateProfile(tkGamer)).toBe(false);
      expect(parseTikTokProfileData(tkGamer, 'https://tiktok.com/@pubg_baku_champ')).toBeNull();
    });

    it('confirms that having a phone alone does NOT classify a profile as realtor', () => {
      const genericPerson: InstagramProfileData = {
        username: 'eli_veliyev_99',
        fullName: 'Əli Vəliyev',
        biography: 'Personal blog. Baku, Azerbaijan. Tel: 050 777 88 99',
      };
      expect(isInstagramRealEstateProfile(genericPerson)).toBe(false);
      expect(parseInstagramProfileData(genericPerson, 'https://instagram.com/eli_veliyev_99')).toBeNull();
    });
  });

  describe('2. No-Phone Profile Safety', () => {
    it('rejects realtor profiles without a public phone to avoid phantom contacts', () => {
      const noPhoneIg: InstagramProfileData = {
        username: 'baku_realtor_direct_only',
        fullName: 'Baku Real Estate Direct Only',
        biography: 'Daşınmaz əmlak agentliyi. Mənzil satışı və kirayəsi. Yalnız Direct-ə yazın!',
        businessCategory: 'Real Estate Agency',
      };
      expect(isInstagramRealEstateProfile(noPhoneIg)).toBe(true);
      expect(parseInstagramProfileData(noPhoneIg, 'https://instagram.com/baku_realtor_direct_only')).toBeNull();

      const noPhoneTk: TikTokProfileData = {
        username: 'emlak_makler_direct',
        nickname: 'Əmlakçı Samir',
        signature: 'Bakıda evlərin alqı-satqısı. Daşınmaz əmlak. Mesaj bölməsinə yazın.',
      };
      expect(isTikTokRealEstateProfile(noPhoneTk)).toBe(true);
      expect(parseTikTokProfileData(noPhoneTk, 'https://tiktok.com/@emlak_makler_direct')).toBeNull();
    });
  });

  describe('3. Phone Format Normalization & Dedup', () => {
    it('normalizes 050..., +99450..., and 99450... to identical canonical E.164 string', () => {
      const f1 = normalizePhone('0501234567', 'AZ');
      const f2 = normalizePhone('+994501234567', 'AZ');
      const f3 = normalizePhone('994501234567', 'AZ');
      const f4 = normalizePhone('(050) 123-45-67', 'AZ');
      const f5 = normalizePhone('+994 (50) 123 45 67', 'AZ');

      expect(f1.normalized).toBe('+994501234567');
      expect(f2.normalized).toBe('+994501234567');
      expect(f3.normalized).toBe('+994501234567');
      expect(f4.normalized).toBe('+994501234567');
      expect(f5.normalized).toBe('+994501234567');

      const set = new Set([f1.normalized, f2.normalized, f3.normalized, f4.normalized, f5.normalized]);
      expect(set.size).toBe(1);
    });
  });
});
