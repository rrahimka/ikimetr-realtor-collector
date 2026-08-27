import { describe, expect, it } from 'vitest';
import {
  getSourceFormDefaults,
  SOCIAL_SOURCE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  WEBSITE_SOURCE_OPTIONS,
} from '../lib/source-options';

describe('Simplified source form configuration', () => {
  it('separates sources into website and social options', () => {
    expect(WEBSITE_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'bina_agency', labelKey: 'sourceType.binaAgency' }));
    expect(WEBSITE_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'tap_az', labelKey: 'sourceType.tapAz' }));
    expect(WEBSITE_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'arenda_az', labelKey: 'sourceType.arendaAz' }));

    expect(SOCIAL_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'instagram_profile', labelKey: 'sourceType.instagramProfile' }));
    expect(SOCIAL_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'tiktok_profile', labelKey: 'sourceType.tiktokProfile' }));
    expect(SOCIAL_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'telegram_channel', labelKey: 'sourceType.telegramChannel' }));
    expect(SOCIAL_SOURCE_OPTIONS).toContainEqual(expect.objectContaining({ value: 'facebook_page', labelKey: 'sourceType.facebookPage' }));

    expect(SOURCE_TYPE_OPTIONS).not.toContainEqual(expect.objectContaining({ value: 'test_fixture' }));
  });

  it('uses safe centralized defaults and delay in seconds for Bina and websites', () => {
    expect(getSourceFormDefaults('bina_agency')).toEqual({
      maxPages: 50,
      maxDepth: 0,
      delayMs: 10_000,
      delaySeconds: 10,
      language: 'AZ',
      placeholder: 'https://bina.az/baki/alqi-satqi/menziller',
    });

    expect(getSourceFormDefaults('website')).toEqual({
      maxPages: 50,
      maxDepth: 1,
      delayMs: 1_000,
      delaySeconds: 1,
      language: 'AZ',
      placeholder: 'https://...',
    });

    expect(getSourceFormDefaults('telegram_channel')).toEqual({
      maxPages: 50,
      maxDepth: 0,
      delayMs: 2_000,
      delaySeconds: 2,
      language: 'mixed',
      placeholder: 'https://t.me/... / @username / поисковая фраза',
    });
  });
});
