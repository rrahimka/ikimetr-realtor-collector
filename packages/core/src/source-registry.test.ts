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
    expect(isSourceSupported('stop.az')).toBe(false);
    expect(isSourceSupported('emlak.az')).toBe(false);

    expect(getSourceOperationalStatus('https://bina.az/items/123')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://tap.az/elanlar/123')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://arenda.az/kiraye')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://yeniemlak.az/elan/axtar')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://emlakbazari.az/properties')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://ipoteka.az')).toBe('SUPPORTED_VERIFIED');
    expect(getSourceOperationalStatus('https://city.az')).toBe('SUPPORTED_VERIFIED');
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
});
