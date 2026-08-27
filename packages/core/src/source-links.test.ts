import { describe, it, expect } from 'vitest';
import {
  getSafeSourceUrl,
  formatPlatformDisplay,
  getPlatformTitle,
  getLeadSourceContext,
  getLeadSourceTooltip,
  resolveLeadSourceUrl,
} from './source-links';

describe('Lead Source Links & Security Validation', () => {
  describe('getSafeSourceUrl', () => {
    it('allows valid https and http URLs', () => {
      expect(getSafeSourceUrl('https://t.me/baku_real_estate/5001')).toBe('https://t.me/baku_real_estate/5001');
      expect(getSafeSourceUrl('http://bina.az/items/12345')).toBe('http://bina.az/items/12345');
      expect(getSafeSourceUrl('https://www.instagram.com/p/DB12345/')).toBe('https://www.instagram.com/p/DB12345/');
      expect(getSafeSourceUrl('https://www.tiktok.com/@baku_realtor/video/712345')).toBe('https://www.tiktok.com/@baku_realtor/video/712345');
      expect(getSafeSourceUrl('https://tap.az/elanlar/123456')).toBe('https://tap.az/elanlar/123456');
    });

    it('allows valid tg:// deep links', () => {
      expect(getSafeSourceUrl('tg://resolve?domain=baku_real_estate')).toBe('tg://resolve?domain=baku_real_estate');
    });

    it('strips user credentials from URLs', () => {
      expect(getSafeSourceUrl('https://user:password@bina.az/items/999')).toBe('https://bina.az/items/999');
    });

    it('strictly rejects javascript: URLs to prevent XSS', () => {
      expect(getSafeSourceUrl('javascript:alert(1)')).toBeNull();
      expect(getSafeSourceUrl('JAVASCRIPT:alert("xss")')).toBeNull();
      expect(getSafeSourceUrl('  javascript:void(0)  ')).toBeNull();
    });

    it('strictly rejects data:, file:, vbscript:, and blob: protocols', () => {
      expect(getSafeSourceUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(getSafeSourceUrl('file:///etc/passwd')).toBeNull();
      expect(getSafeSourceUrl('vbscript:msgbox(1)')).toBeNull();
      expect(getSafeSourceUrl('blob:https://example.com/uuid')).toBeNull();
    });

    it('rejects null bytes and newline injection', () => {
      expect(getSafeSourceUrl('https://t.me/baku\0evil')).toBeNull();
      expect(getSafeSourceUrl('https://t.me/baku\r\nheader')).toBeNull();
    });

    it('handles null, undefined, empty, and malformed strings safely', () => {
      expect(getSafeSourceUrl(null)).toBeNull();
      expect(getSafeSourceUrl(undefined)).toBeNull();
      expect(getSafeSourceUrl('')).toBeNull();
      expect(getSafeSourceUrl('   ')).toBeNull();
      expect(getSafeSourceUrl('not-a-valid-url')).toBeNull();
    });
  });

  describe('formatPlatformDisplay & getPlatformTitle', () => {
    it('formats platforms to canonical display names', () => {
      expect(formatPlatformDisplay('telegram')).toBe('telegram');
      expect(formatPlatformDisplay('telegram_channel')).toBe('telegram');
      expect(formatPlatformDisplay('instagram')).toBe('instagram');
      expect(formatPlatformDisplay('tiktok')).toBe('tiktok');
      expect(formatPlatformDisplay('facebook')).toBe('facebook');
      expect(formatPlatformDisplay('bina_agency')).toBe('bina.az');
      expect(formatPlatformDisplay('bina.az')).toBe('bina.az');
      expect(formatPlatformDisplay('tap_az')).toBe('tap.az');
      expect(formatPlatformDisplay('arenda_az')).toBe('arenda.az');
      expect(formatPlatformDisplay('yeniemlak_az')).toBe('yeniemlak.az');
      expect(formatPlatformDisplay(undefined)).toBe('unknown');
    });

    it('returns clean platform titles for headers and tooltips', () => {
      expect(getPlatformTitle('telegram')).toBe('Telegram');
      expect(getPlatformTitle('instagram')).toBe('Instagram');
      expect(getPlatformTitle('tiktok')).toBe('TikTok');
      expect(getPlatformTitle('facebook')).toBe('Facebook');
      expect(getPlatformTitle('bina_agency')).toBe('Bina.az');
      expect(getPlatformTitle('tap_az')).toBe('Tap.az');
      expect(getPlatformTitle('arenda_az')).toBe('Arenda.az');
    });
  });

  describe('getLeadSourceContext', () => {
    it('extracts Telegram channel from URL slug when present', () => {
      const ctx = getLeadSourceContext({
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: 'https://t.me/baku_real_estate/5001',
        username: 'realtor_az',
      });
      expect(ctx.platformTitle).toBe('Telegram');
      expect(ctx.channelOrProfileLabel).toBe('Группа/канал');
      expect(ctx.channelOrProfileValue).toBe('baku_real_estate');
      expect(ctx.surface).toBe('message_text');
      expect(ctx.safeUrl).toBe('https://t.me/baku_real_estate/5001');
    });

    it('falls back to username when Telegram URL has numeric internal channel id', () => {
      const ctx = getLeadSourceContext({
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: 'https://t.me/c/123456789/5001',
        username: 'azerbaijan_agent',
      });
      expect(ctx.channelOrProfileValue).toBe('@azerbaijan_agent');
    });

    it('extracts Instagram profile / handle correctly', () => {
      const ctx = getLeadSourceContext({
        sourcePlatform: 'instagram',
        sourceSurface: 'post_caption',
        sourceUrl: 'https://instagram.com/p/Cx12345',
        username: 'emlak_baku',
      });
      expect(ctx.platformTitle).toBe('Instagram');
      expect(ctx.channelOrProfileValue).toBe('@emlak_baku');
    });

    it('extracts TikTok profile / handle correctly', () => {
      const ctx = getLeadSourceContext({
        sourcePlatform: 'tiktok',
        sourceSurface: 'video_caption',
        sourceUrl: 'https://tiktok.com/@baku_house/video/12345',
        username: 'baku_house',
      });
      expect(ctx.platformTitle).toBe('TikTok');
      expect(ctx.channelOrProfileValue).toBe('@baku_house');
    });

    it('handles website listing URLs correctly', () => {
      const ctx = getLeadSourceContext({
        sourcePlatform: 'bina_agency',
        sourceSurface: 'listing_page',
        sourceUrl: 'https://bina.az/items/987654',
      });
      expect(ctx.platformTitle).toBe('Bina.az');
      expect(ctx.surface).toBe('listing_page');
      expect(ctx.channelOrProfileValue).toBe('/items/987654');
    });

    it('handles legacy lead with missing URL gracefully', () => {
      const ctx = getLeadSourceContext({
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: null,
      });
      expect(ctx.platformTitle).toBe('Telegram');
      expect(ctx.safeUrl).toBeNull();
      expect(ctx.channelOrProfileValue).toBeNull();
    });
  });

  describe('getLeadSourceTooltip', () => {
    it('generates rich multi-line tooltip with "Открыть оригинал" when URL is valid', () => {
      const tooltip = getLeadSourceTooltip({
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: 'https://t.me/baku_real_estate/5001',
      });
      expect(tooltip).toContain('Источник: Telegram');
      expect(tooltip).toContain('Группа/канал: baku_real_estate');
      expect(tooltip).toContain('Поверхность: message_text');
      expect(tooltip).toContain('Открыть оригинал');
    });

    it('generates clean tooltip without "Открыть оригинал" when URL is missing', () => {
      const tooltip = getLeadSourceTooltip({
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: undefined,
      });
      expect(tooltip).toContain('Источник: Telegram');
      expect(tooltip).toContain('Поверхность: message_text');
      expect(tooltip).not.toContain('Открыть оригинал');
    });
  });

  describe('resolveLeadSourceUrl', () => {
    it('resolves specific valid source URLs', () => {
      expect(resolveLeadSourceUrl({ sourceUrl: 'https://t.me/baku_re/123', sourcePlatform: 'telegram' })).toBe('https://t.me/baku_re/123');
    });

    it('never fabricates URLs if sourceUrl is empty or null', () => {
      expect(resolveLeadSourceUrl({ sourceUrl: null, sourcePlatform: 'telegram', username: 'john' })).toBeNull();
      expect(resolveLeadSourceUrl({ sourceUrl: '', sourcePlatform: 'instagram' })).toBeNull();
    });
  });
});
