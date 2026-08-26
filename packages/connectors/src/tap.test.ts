import { describe, expect, it, vi } from 'vitest';
import { validateTapUrl, detectExplicitTapSellerType, discoverTapListingUrls, parseTapListingPage, crawlTapAz, extractAzCity } from './tap.js';

const publicResolver = (): Promise<string[]> => Promise.resolve(['93.184.216.34']);

describe('Tap.az connector', () => {
  it('validates Tap.az HTTPS URLs and canonicalizes listing URLs', () => {
    expect(validateTapUrl('https://tap.az/elanlar/dasinmaz-emlak/12345', 'listing')).toBe('https://tap.az/elanlar/12345');
    expect(() => validateTapUrl('http://tap.az/elanlar/12345')).toThrow();
    expect(() => validateTapUrl('https://evil.tap.az.test/elanlar/12345')).toThrow();
  });

  it('detects seller types correctly', () => {
    expect(detectExplicitTapSellerType('Mağaza "Karvan Əmlak"')).toBe('agency');
    expect(detectExplicitTapSellerType('Vasitəçi (makler) Əli')).toBe('agent');
    expect(detectExplicitTapSellerType('Mülkiyyətçi, şəxsi ev')).toBe('owner');
    expect(detectExplicitTapSellerType('Təcili satılır')).toBe('unknown');
  });

  it('extracts Azerbaijani cities', () => {
    expect(extractAzCity('Bakı şəhəri, Nəsimi rayonu')).toBe('Bakı');
    expect(extractAzCity('Sumqayıt 10-cu mkr')).toBe('Sumqayıt');
    expect(extractAzCity('Gəncə mərkəz')).toBe('Gəncə');
  });

  it('discovers listing URLs from search page HTML', () => {
    const html = `
      <div>
        <a href="/elanlar/dasinmaz-emlak/menziller/1001">Mənzil 1</a>
        <a href="/elanlar/dasinmaz-emlak/menziller/1002">Mənzil 2</a>
        <a href="/haqqimizda">About</a>
      </div>
    `;
    const urls = discoverTapListingUrls(html, 'https://tap.az');
    expect(urls).toEqual(['https://tap.az/elanlar/1001', 'https://tap.az/elanlar/1002']);
  });

  it('parses agency listing page and skips owner listing page', () => {
    const agencyHtml = `
      <html>
        <body>
          <h1 class="lot-title">Nərimanovda 3 otaqlı mənzil</h1>
          <div class="shop-info">Mağaza "Rieltor Group"</div>
          <div class="location">Bakı, Nərimanov</div>
          <a href="tel:+994501234567">Zəng et</a>
        </body>
      </html>
    `;
    const parsedAgency = parseTapListingPage(agencyHtml, 'https://tap.az/elanlar/1001');
    expect(parsedAgency).not.toBeNull();
    expect(parsedAgency?.rawPhone).toBe('+994501234567');
    expect(parsedAgency?.explicitSellerType).toBe('agency');
    expect(parsedAgency?.agency).toContain('Rieltor Group');
    expect(parsedAgency?.city).toBe('Bakı');

    const ownerHtml = `
      <html>
        <body>
          <h1 class="lot-title">Şəxsi evim satılır</h1>
          <div class="author-info">Mülkiyyətçi</div>
          <a href="tel:+994509998877">Zəng et</a>
        </body>
      </html>
    `;
    const parsedOwner = parseTapListingPage(ownerHtml, 'https://tap.az/elanlar/1002');
    expect(parsedOwner).toBeNull(); // Skipped owner!
  });

  it('crawls Tap.az search page and listings with mocks', async () => {
    const searchHtml = '<a href="/elanlar/1001">Elan 1</a>';
    const listingHtml = '<div class="shop-info">Mağaza "Emlakçı"</div><a href="tel:+994553332211">055-333-22-11</a>';

    const fetcher = vi.fn((url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/1001')) {
        return Promise.resolve(new Response(listingHtml, { headers: { 'content-type': 'text/html' } }));
      }
      return Promise.resolve(new Response(searchHtml, { headers: { 'content-type': 'text/html' } }));
    });

    const res = await crawlTapAz({ startUrl: 'https://tap.az/elanlar/dasinmaz-emlak', maxPages: 2, maxDepth: 0, delayMs: 0 }, { fetcher, resolver: publicResolver });
    expect(res.pagesChecked).toBe(2);
    expect(res.items.length).toBe(1);
    expect(res.items[0]?.rawPhone).toBe('+994553332211');
    expect(res.items[0]?.explicitSellerType).toBe('agency');
  });
});
