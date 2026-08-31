import { describe, it, expect } from 'vitest';
import { isSocialSourceConnected } from './source-options';

const connected = { telegram: { status: 'connected' } };
const disconnected = { telegram: { status: 'disconnected' } };

describe('isSocialSourceConnected — connection truthfulness', () => {
  it('does NOT treat Telegram as connected merely because the source type is Telegram', () => {
    // Regression: Telegram used to be reported as always connected, which
    // queued runs that could never authenticate.
    expect(isSocialSourceConnected('telegram_channel', '@baku_realty', undefined)).toBe(false);
    expect(isSocialSourceConnected('telegram_channel', '@baku_realty', {})).toBe(false);
    expect(isSocialSourceConnected('telegram_group', 'https://t.me/baku_rent', disconnected)).toBe(false);
  });

  it('treats Telegram as connected only when the account status is connected', () => {
    expect(isSocialSourceConnected('telegram_channel', '@baku_realty', connected)).toBe(true);
    expect(isSocialSourceConnected('telegram_group', 'https://t.me/baku_rent', connected)).toBe(true);
  });

  it('matches a Telegram source by locator even when the type is generic', () => {
    expect(isSocialSourceConnected('website', 'https://t.me/baku_realty', connected)).toBe(true);
    expect(isSocialSourceConnected('website', 'https://t.me/baku_realty', disconnected)).toBe(false);
  });

  it('ignores unrelated account statuses', () => {
    expect(
      isSocialSourceConnected('telegram_channel', '@baku_realty', { instagram: { status: 'connected' } }),
    ).toBe(false);
  });

  it('applies the same rule to the other social platforms', () => {
    expect(isSocialSourceConnected('instagram_profile', '@a', { instagram: { status: 'connected' } })).toBe(true);
    expect(isSocialSourceConnected('tiktok_profile', '@a', { tiktok: { status: 'connected' } })).toBe(true);
    expect(isSocialSourceConnected('facebook_page', 'https://facebook.com/x', { facebook: { status: 'connected' } })).toBe(true);
    expect(isSocialSourceConnected('whatsapp_group', 'https://whatsapp.com/x', { whatsapp: { status: 'connected' } })).toBe(true);
    expect(isSocialSourceConnected('instagram_profile', '@a', { telegram: { status: 'connected' } })).toBe(false);
  });

  it('allows the test fixture connector without any account', () => {
    expect(isSocialSourceConnected('test_fixture', 'fixture', undefined)).toBe(true);
  });

  it('returns false for an unrecognised social source', () => {
    expect(isSocialSourceConnected('unknown_social', 'https://example.com', connected)).toBe(false);
  });
});
