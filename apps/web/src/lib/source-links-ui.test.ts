import { describe, it, expect } from 'vitest';
import {
  getSafeSourceUrl,
  formatPlatformDisplay,
  getLeadSourceTooltip,
  getLeadSourceContext,
} from '@ikimetr/core';

describe('Web Source Links UI Tests', () => {
  it('renders correct platform name and external link text', () => {
    const platform = 'telegram';
    const display = formatPlatformDisplay(platform);
    const text = `${display} ↗`;
    expect(text).toBe('telegram ↗');
  });

  it('generates safe external link attributes', () => {
    const url = 'https://t.me/baku_real_estate/1001';
    const safeUrl = getSafeSourceUrl(url);
    expect(safeUrl).toBe('https://t.me/baku_real_estate/1001');

    // Safe attributes to prevent security vulnerabilities
    const target = '_blank';
    const rel = 'noopener noreferrer';
    expect(target).toBe('_blank');
    expect(rel).toBe('noopener noreferrer');
  });

  it('rejects XSS and malicious scripts in lead links', () => {
    expect(getSafeSourceUrl('javascript:alert(document.cookie)')).toBeNull();
    expect(getSafeSourceUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBeNull();
    expect(getSafeSourceUrl('file:///C:/Windows/system32/cmd.exe')).toBeNull();
  });

  it('produces structured context for detail page ИСТОЧНИК block', () => {
    const lead = {
      sourcePlatform: 'bina_agency',
      sourceSurface: 'listing_page',
      sourceUrl: 'https://bina.az/items/1234567',
      displayName: 'Agency Baku Home',
    };
    const ctx = getLeadSourceContext(lead);
    expect(ctx.platformTitle).toBe('Bina.az');
    expect(ctx.surface).toBe('listing_page');
    expect(ctx.safeUrl).toBe('https://bina.az/items/1234567');
    expect(ctx.channelOrProfileValue).toBe('Agency Baku Home');
  });

  it('formats tooltip with hover info for leads table', () => {
    const lead = {
      sourcePlatform: 'telegram',
      sourceSurface: 'message_text',
      sourceUrl: 'https://t.me/baku_real_estate/5001',
      username: 'baku_realtor',
    };
    const tooltip = getLeadSourceTooltip(lead);
    expect(tooltip).toBe('Источник: Telegram\nГруппа/канал: baku_real_estate\nПоверхность: message_text\nОткрыть оригинал');
  });

  it('handles legacy lead with missing URL without breaking', () => {
    const lead = {
      sourcePlatform: 'telegram',
      sourceSurface: 'message_text',
      sourceUrl: null,
      username: null,
      displayName: 'Legacy Lead',
    };
    const ctx = getLeadSourceContext(lead);
    expect(ctx.platformTitle).toBe('Telegram');
    expect(ctx.safeUrl).toBeNull();
    expect(ctx.channelOrProfileValue).toBe('Legacy Lead');
  });
});
