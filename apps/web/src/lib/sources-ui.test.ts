import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ITEMS_PER_RUN,
  deriveSourceDisplayName,
  getSafeSourceUrl,
  getSourceCategory,
  isSourceSupported,
} from '@ikimetr/core';

describe('Sources UI Helper Tests', () => {
  it('categorizes sources as website vs social correctly', () => {
    expect(getSourceCategory('bina_agency')).toBe('website');
    expect(getSourceCategory('tap_az')).toBe('website');
    expect(getSourceCategory('arenda_az')).toBe('website');
    expect(getSourceCategory('yeniemlak_az')).toBe('website');
    expect(getSourceCategory('website')).toBe('website');

    expect(getSourceCategory('instagram_profile')).toBe('social');
    expect(getSourceCategory('tiktok_profile')).toBe('social');
    expect(getSourceCategory('telegram_channel')).toBe('social');
    expect(getSourceCategory('facebook_page')).toBe('social');
    expect(getSourceCategory('https://t.me/baku_emlak')).toBe('social');
    expect(getSourceCategory('@baku_channel')).toBe('social');
  });

  it('automatically derives display names for sources', () => {
    expect(deriveSourceDisplayName({ type: 'bina_agency', locator: 'https://bina.az/baki' })).toBe('Bina.az');
    expect(deriveSourceDisplayName({ type: 'tap_az', locator: 'https://tap.az/elanlar' })).toBe('Tap.az');
    expect(deriveSourceDisplayName({ type: 'arenda_az', locator: 'https://arenda.az' })).toBe('Arenda.az');
    expect(deriveSourceDisplayName({ type: 'yeniemlak_az', locator: 'https://yeniemlak.az' })).toBe('YeniEmlak.az');
    expect(deriveSourceDisplayName({ type: 'telegram_channel', locator: 'https://t.me/baku_emlak' })).toBe('Telegram — @baku_emlak');
    expect(deriveSourceDisplayName({ type: 'telegram_channel', locator: '@baku_emlak' })).toBe('Telegram — @baku_emlak');
    expect(deriveSourceDisplayName({ type: 'instagram_profile', locator: 'https://instagram.com/quliyev_estates' })).toBe('Instagram — @quliyev_estates');
    expect(deriveSourceDisplayName({ type: 'tiktok_profile', locator: 'https://tiktok.com/@baku_realtor' })).toBe('TikTok — @baku_realtor');
    expect(deriveSourceDisplayName({ type: 'facebook_page', locator: 'https://facebook.com/bakuemlak' })).toBe('Facebook — bakuemlak');
  });

  it('validates clickable URLs and rejects non-URLs or dangerous protocols', () => {
    // Valid URLs
    expect(getSafeSourceUrl('https://bina.az/items/123')).toBe('https://bina.az/items/123');
    expect(getSafeSourceUrl('https://t.me/baku_realtor')).toBe('https://t.me/baku_realtor');
    expect(getSafeSourceUrl('http://example.az')).toBe('http://example.az/');

    // Plain text queries (not URLs)
    expect(getSafeSourceUrl('daşınmaz əmlak bakı')).toBeNull();
    expect(getSafeSourceUrl('@baku_channel')).toBeNull();

    // Prohibited schemes
    expect(getSafeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeSourceUrl('data:text/html,malicious')).toBeNull();
    expect(getSafeSourceUrl('file:///etc/passwd')).toBeNull();
  });

  it('enforces safe centralized default cap of 50 items/pages', () => {
    expect(DEFAULT_MAX_ITEMS_PER_RUN).toBe(50);
  });

  it('identifies operational support status for verified sources', () => {
    expect(isSourceSupported('bina_agency')).toBe(true);
    expect(isSourceSupported('tap_az')).toBe(true);
    expect(isSourceSupported('arenda_az')).toBe(true);
    expect(isSourceSupported('yeniemlak_az')).toBe(true);
    expect(isSourceSupported('emlakbazari_az')).toBe(true);
    expect(isSourceSupported('instagram_profile')).toBe(true);
    expect(isSourceSupported('tiktok_profile')).toBe(true);
    expect(isSourceSupported('stop_az')).toBe(false);
  });
});
