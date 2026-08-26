import { describe, expect, it } from 'vitest';
import {
  BINA_OUTCOMES,
  detectExplicitBinaSellerType,
  discoverBinaListingUrls,
  hasVisibleAgencyMarker,
  isExplicitOwnerMarker,
  isGenericBinaOwnerLabel,
  maskPhone,
  normalizeVisibleBinaPhone,
  validateBinaUrl,
} from './bina';


describe('validateBinaUrl', () => {
  it.each([
    'http://bina.az/items/123',
    'https://bina.az.evil.test/items/123',
    'https://bina-az.test/items/123',
    'https://user:password@bina.az/items/123',
    'https://bina.az:444/items/123',
    'file:///tmp/listing.html',
    'https://127.0.0.1/items/123',
  ])('rejects unsafe URL %s', (input) => {
    expect(() => validateBinaUrl(input, 'listing')).toThrow('Bina URL is not allowed');
  });

  it('canonicalizes exact Bina listing hosts and numeric IDs', () => {
    expect(validateBinaUrl('https://www.bina.az/items/00123/?from=search#top', 'listing')).toBe('https://bina.az/items/123');
  });

  it.each([
    'https://bina.az/items/not-a-number',
    'https://bina.az/items/123/details',
    'https://bina.az/item/123',
  ])('rejects a non-canonical listing path %s', (input) => {
    expect(() => validateBinaUrl(input, 'listing')).toThrow('Bina listing URL is not canonical');
  });

  it('accepts an exact-host HTTPS search URL without changing its path', () => {
    expect(validateBinaUrl('https://www.bina.az/baki/alqi-satqi/menziller?page=2', 'search')).toBe(
      'https://www.bina.az/baki/alqi-satqi/menziller?page=2',
    );
  });
});

describe('discoverBinaListingUrls', () => {
  const html = `
    <a href="/items/123">first</a>
    <a href="https://www.bina.az/items/123?duplicate=1">duplicate</a>
    <a href="https://bina.az/items/456/">second</a>
    <a href="https://bina.az.evil.test/items/999">lookalike</a>
    <a href="/items/not-numeric">invalid</a>
  `;

  it('returns unique canonical listing URLs and excludes lookalikes', () => {
    expect(discoverBinaListingUrls(html, 'https://bina.az/search', 100)).toEqual([
      'https://bina.az/items/123',
      'https://bina.az/items/456',
    ]);
  });

  it('applies the hard result cap before returning more links', () => {
    expect(discoverBinaListingUrls(html, 'https://bina.az/search', 1)).toEqual(['https://bina.az/items/123']);
  });
});

describe('visible agency and phone rules', () => {
  it.each(['Agentlik', 'AGENTLİK', '  Agentlik  ', 'Elan sahibi: Agentlik', 'Vasitəçi', 'Rieltor', 'Əmlak Agentliyi'])('recognizes the professional seller marker in %s', (text) => {
    expect(hasVisibleAgencyMarker(text)).toBe(true);
  });

  it.each(['agentlikdə iş', 'Şəxsi elan', '', 'Agentliklər', 'Mülkiyyətçi'])('rejects non-agent or owner marker in %s', (text) => {
    expect(hasVisibleAgencyMarker(text)).toBe(false);
  });

  it.each(['Mülkiyyətçi', 'Sahibindən', 'Şəxsi', 'Собственник'])('recognizes owner markers in %s', (text) => {
    expect(detectExplicitBinaSellerType(text)).toBe('owner');
    expect(isExplicitOwnerMarker(text)).toBe(true);
  });

  it.each(['Elanın sahibi', 'Elanın sahibi:', 'Əlanın sahibi', '  elanın sahibi  '])('treats the generic UI label %s as not an owner marker', (text) => {
    expect(isGenericBinaOwnerLabel(text)).toBe(true);
    expect(isExplicitOwnerMarker(text)).toBe(false);
  });

  it.each(['Mülkiyyətçi', 'Sahibindən', 'Ev sahibi ilə', 'Bakı Emlak Agentlik', ''])('keeps real seller text %s out of the generic label rule', (text) => {
    expect(isGenericBinaOwnerLabel(text)).toBe(false);
  });


  it.each([
    ['+994 50 123 45 67', '+994501234567'],
    ['050 123 45 67', '+994501234567'],
    ['(050) 123-45-67', '+994501234567'],
  ])('normalizes a fully visible Azerbaijani phone %s', (input, expected) => {
    expect(normalizeVisibleBinaPhone(input)).toBe(expected);
  });

  it.each(['+994 50 *** ** 67', '050 123', '+7 916 111 11 11', 'Nömrəni göstər', ''])('rejects a masked, incomplete, foreign, or missing phone %s', (input) => {
    expect(normalizeVisibleBinaPhone(input)).toBeUndefined();
  });

  it('masks the middle digits before diagnostics', () => {
    expect(maskPhone('+994501234567')).toBe('+99450*****67');
  });

  it('defines every persisted Bina outcome', () => {
    expect(BINA_OUTCOMES).toEqual([
      'accepted',
      'duplicate',
      'private_seller',
      'missing_phone',
      'invalid_phone',
      'page_removed',
      'blocked',
      'parse_error',
      'cancelled',
    ]);
  });
});
