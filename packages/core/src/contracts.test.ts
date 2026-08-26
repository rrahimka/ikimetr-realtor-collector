import { describe, expect, it } from 'vitest';
import { detectSourceTypeFromUrl, sourceSchema } from './contracts';

const binaSource = {
  name: 'Bina.az Agentlik',
  type: 'bina_agency' as const,
  locator: 'https://bina.az/baki/alqi-satqi/menziller',
  language: 'AZ' as const,
  maxPages: 100,
  maxDepth: 0,
  delayMs: 10_000,
  enabled: true,
  killSwitch: false,
};

describe('bina_agency source contract', () => {
  it('accepts only the safe Bina runtime limits', () => {
    expect(sourceSchema.parse(binaSource)).toMatchObject({
      type: 'bina_agency',
      maxPages: 100,
      maxDepth: 0,
      delayMs: 10_000,
    });
  });

  it.each([
    ['more than 500 listings', { maxPages: 501 }],
    ['a crawl depth above zero', { maxDepth: 1 }],
    ['a delay below ten seconds', { delayMs: 9_999 }],
  ])('rejects %s', (_name, override) => {
    expect(() => sourceSchema.parse({ ...binaSource, ...override })).toThrow();
  });


  it.each([
    'http://bina.az/baki/alqi-satqi/menziller',
    'https://bina.az.evil.test/items/1',
    'https://user:pass@bina.az/items/1',
    'https://bina.az:444/items/1',
    'file:///tmp/bina.html',
  ])('rejects unsafe Bina locator %s', (locator) => {
    expect(() => sourceSchema.parse({ ...binaSource, locator })).toThrow();
  });

  it('accepts the exact www host over HTTPS', () => {
    expect(sourceSchema.parse({ ...binaSource, locator: 'https://www.bina.az/baki' }).locator).toBe('https://www.bina.az/baki');
  });

  it.each(['website', 'listing_page'] as const)('rejects a Bina locator disguised as %s', (type) => {
    expect(() => sourceSchema.parse({ ...binaSource, type })).toThrow();
  });

  it('does not impose Bina limits on the artificial fixture source', () => {
    expect(sourceSchema.parse({
      ...binaSource,
      type: 'test_fixture',
      locator: 'fixture://contacts',
      maxPages: 1,
      delayMs: 0,
    })).toMatchObject({ type: 'test_fixture', maxPages: 1, delayMs: 0 });
  });

  it('detects source type from URL accurately', () => {
    expect(detectSourceTypeFromUrl('https://bina.az/baki/alqi-satqi')).toBe('bina_agency');
    expect(detectSourceTypeFromUrl('https://tap.az/elanlar/dasinmaz-emlak')).toBe('tap_az');
    expect(detectSourceTypeFromUrl('https://arenda.az/kiraye-evler')).toBe('arenda_az');
    expect(detectSourceTypeFromUrl('https://stop.az/alqi-satqi')).toBe('stop_az');
    expect(detectSourceTypeFromUrl('https://instagram.com/realtor_baku')).toBe('instagram_profile');
    expect(detectSourceTypeFromUrl('https://tiktok.com/@baku_realtor')).toBe('tiktok_profile');
    expect(detectSourceTypeFromUrl('https://t.me/baku_emlak')).toBe('telegram_channel');
    expect(detectSourceTypeFromUrl('@baku_emlak_official')).toBe('telegram_channel');
    expect(detectSourceTypeFromUrl('https://example.com/listings')).toBe('website');
  });
});
