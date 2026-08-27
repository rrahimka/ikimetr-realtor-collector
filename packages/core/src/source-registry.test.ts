import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SOURCE_REGISTRY,
  extractDomainFromLocator,
  getSourceDefinition,
  getSourceOperationalStatus,
  isSourceSupported,
} from './source-registry.js';

describe('Source Registry', () => {
  it('contains at least 20 real estate portals for Azerbaijan', () => {
    const domains = Object.keys(CANONICAL_SOURCE_REGISTRY);
    expect(domains.length).toBeGreaterThanOrEqual(20);
    expect(domains).toContain('bina.az');
    expect(domains).toContain('tap.az');
    expect(domains).toContain('arenda.az');
    expect(domains).toContain('emlak.az');
    expect(domains).toContain('stop.az');
  });

  it('guarantees STOCK ADS does not exist in the registry', () => {
    for (const [domain, def] of Object.entries(CANONICAL_SOURCE_REGISTRY)) {
      expect(domain.toLowerCase()).not.toContain('stock');
      expect(def.name.toLowerCase()).not.toContain('stock');
    }
  });

  it('identifies supported vs candidate/unsupported/dead sources', () => {
    expect(isSourceSupported('bina.az')).toBe(true);
    expect(isSourceSupported('tap.az')).toBe(true);
    expect(isSourceSupported('arenda.az')).toBe(true);
    expect(isSourceSupported('yeniemlak.az')).toBe(true);
    expect(isSourceSupported('emlakbazari.az')).toBe(true);
    expect(isSourceSupported('ipoteka.az')).toBe(true);
    expect(isSourceSupported('city.az')).toBe(true);
    expect(isSourceSupported('vipemlak.az')).toBe(true);
    expect(isSourceSupported('ev10.az')).toBe(true);
    expect(isSourceSupported('lalafo.az')).toBe(true);
    expect(isSourceSupported('unvan.az')).toBe(true);
    expect(isSourceSupported('stop.az')).toBe(false);
    expect(isSourceSupported('emlak.az')).toBe(false);

    expect(getSourceOperationalStatus('https://bina.az/items/123')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://tap.az/elanlar/123')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://arenda.az/kiraye')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://yeniemlak.az/elan/axtar')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://emlakbazari.az/properties')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://ipoteka.az')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://city.az')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://vipemlak.az/elanlar')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://ev10.az/alqi-satqi')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://lalafo.az/baku/nedvizhimost')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://unvan.az/dasinmaz-emlak')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://emlak.az/')).toBe('PROTECTED');
    expect(getSourceOperationalStatus('https://stop.az/')).toBe('DEAD');
  });

  it('extracts canonical domains from locators', () => {
    expect(extractDomainFromLocator('https://www.bina.az/items/123')).toBe('bina.az');
    expect(extractDomainFromLocator('tap.az')).toBe('tap.az');
    expect(extractDomainFromLocator('https://arenda.az/elanlar?p=1')).toBe('arenda.az');
    expect(extractDomainFromLocator('https://yeniemlak.az/elan/123')).toBe('yeniemlak.az');
  });

  it('looks up definitions by domain or connector type', () => {
    expect(getSourceDefinition('bina_agency')?.domain).toBe('bina.az');
    expect(getSourceDefinition('tap_az')?.domain).toBe('tap.az');
    expect(getSourceDefinition('arenda_az')?.domain).toBe('arenda.az');
    expect(getSourceDefinition('yeniemlak_az')?.domain).toBe('yeniemlak.az');
    expect(getSourceDefinition('emlakbazari_az')?.domain).toBe('emlakbazari.az');
    expect(getSourceDefinition('ipoteka_az')?.domain).toBe('ipoteka.az');
    expect(getSourceDefinition('city_az')?.domain).toBe('city.az');
  });

  it('categorizes sources as website or social correctly', async () => {
    const { getSourceCategory, DEFAULT_MAX_ITEMS_PER_RUN } = await import('./source-registry.js');
    expect(DEFAULT_MAX_ITEMS_PER_RUN).toBe(50);
    expect(getSourceCategory('bina_agency')).toBe('website');
    expect(getSourceCategory('tap_az')).toBe('website');
    expect(getSourceCategory('arenda_az')).toBe('website');
    expect(getSourceCategory('website')).toBe('website');
    expect(getSourceCategory('https://yeniemlak.az/elan/123')).toBe('website');

    expect(getSourceCategory('telegram_channel')).toBe('social');
    expect(getSourceCategory('telegram_group')).toBe('social');
    expect(getSourceCategory('instagram_profile')).toBe('social');
    expect(getSourceCategory('tiktok_profile')).toBe('social');
    expect(getSourceCategory('facebook_page')).toBe('social');
    expect(getSourceCategory('https://t.me/baku_emlak')).toBe('social');
    expect(getSourceCategory('https://instagram.com/baku_realtor')).toBe('social');
    expect(getSourceCategory('@baku_channel')).toBe('social');
  });

  it('derives human-friendly display names automatically without manual input', async () => {
    const { deriveSourceDisplayName } = await import('./source-registry.js');
    expect(deriveSourceDisplayName({ type: 'bina_agency', locator: 'https://bina.az/baki' })).toBe('Bina.az');
    expect(deriveSourceDisplayName({ type: 'tap_az', locator: 'https://tap.az/elanlar' })).toBe('Tap.az');
    expect(deriveSourceDisplayName({ type: 'arenda_az', locator: 'https://arenda.az' })).toBe('Arenda.az');
    expect(deriveSourceDisplayName({ type: 'yeniemlak_az', locator: 'https://yeniemlak.az' })).toBe('YeniEmlak.az');
    expect(deriveSourceDisplayName({ type: 'emlakbazari_az', locator: 'https://emlakbazari.az' })).toBe('EmlakBazari.az');
    expect(deriveSourceDisplayName({ type: 'ipoteka_az', locator: 'https://ipoteka.az' })).toBe('Ipoteka.az');
    expect(deriveSourceDisplayName({ type: 'city_az', locator: 'https://city.az' })).toBe('City.az');
    expect(deriveSourceDisplayName({ type: 'vipemlak_az', locator: 'https://vipemlak.az' })).toBe('VIPemlak.az');
    expect(deriveSourceDisplayName({ type: 'ev10_az', locator: 'https://ev10.az' })).toBe('Ev10.az');
    expect(deriveSourceDisplayName({ type: 'lalafo_az', locator: 'https://lalafo.az' })).toBe('Lalafo.az');
    expect(deriveSourceDisplayName({ type: 'unvan_az', locator: 'https://unvan.az' })).toBe('Unvan.az');
    expect(deriveSourceDisplayName({ type: 'stop_az', locator: 'https://stop.az' })).toBe('Stop.az');

    expect(deriveSourceDisplayName({ type: 'telegram_channel', locator: 'https://t.me/baku_emlak' })).toBe('Telegram — @baku_emlak');
    expect(deriveSourceDisplayName({ type: 'telegram_channel', locator: '@baku_emlak' })).toBe('Telegram — @baku_emlak');
    expect(deriveSourceDisplayName({ type: 'instagram_profile', locator: 'https://instagram.com/quliyev_estates' })).toBe('Instagram — @quliyev_estates');
    expect(deriveSourceDisplayName({ type: 'tiktok_profile', locator: 'https://tiktok.com/@baku_realtor' })).toBe('TikTok — @baku_realtor');
    expect(deriveSourceDisplayName({ type: 'facebook_page', locator: 'https://facebook.com/bakuemlak' })).toBe('Facebook — bakuemlak');
    expect(deriveSourceDisplayName({ type: 'google_maps_query', locator: 'baku real estate' })).toBe('Google Maps — baku real estate');
  });
});
