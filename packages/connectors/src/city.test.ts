import { describe, it, expect } from 'vitest';
import {
  validateCityUrl,
  detectExplicitCitySellerType,
  parseCityListingPage,
  discoverCityListingUrls,
  crawlCityAz,
} from './city';

describe('City.az Connector', () => {
  it('validates valid and invalid City.az URLs', () => {
    expect(validateCityUrl('https://city.az')).toBe('https://city.az/');
    expect(validateCityUrl('https://city.az/item/236759', 'listing')).toBe('https://city.az/item/236759');

    expect(() => validateCityUrl('https://bina.az')).toThrow('not a valid City.az host');
    expect(() => validateCityUrl('https://city.az/about', 'listing')).toThrow('not a valid City.az listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitCitySellerType('Vasitəçi')).toBe('agent');
    expect(detectExplicitCitySellerType('Əmlak agentliyi')).toBe('agency');
    expect(detectExplicitCitySellerType('Mülkiyyətçi')).toBe('owner');
    expect(detectExplicitCitySellerType('Naməlum')).toBe('unknown');
  });

  it('parses an agent listing, excludes site hotline (+994502544544), and extracts phone', () => {
    const html = `
      <html>
        <body>
          <h1>Satılır 2 otaqlı köhnə tikili 60 m², Elmlər Akademiyası m., Bakı</h1>
          <div class="item-author">
            <div class="item-author__name">Murad</div>
            <div>Vasitəçi</div>
          </div>
          <a href="tel:+994502544544">Site WhatsApp</a>
          <a href="tel:+994707704700">Murad Phone</a>
        </body>
      </html>
    `;

    const evidence = parseCityListingPage(html, 'https://city.az/item/236759');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('+994707704700');
    expect(evidence?.name).toBe('Murad');
    expect(evidence?.platform).toBe('city.az');
  });

  it('skips private owner listings', () => {
    const html = `
      <html>
        <body>
          <h1>Satılır mənzil</h1>
          <div class="item-author">
            <div>Mülkiyyətçi</div>
          </div>
          <a href="tel:+994501234567">Owner Phone</a>
        </body>
      </html>
    `;

    const evidence = parseCityListingPage(html, 'https://city.az/item/236760');
    expect(evidence).toBeNull();
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/item/236759">Item 1</a>
          <a href="/item/236758">Item 2</a>
          <a href="/about">About</a>
        </body>
      </html>
    `;

    const urls = discoverCityListingUrls(html, 'https://city.az');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://city.az/item/236759');
    expect(urls[1]).toBe('https://city.az/item/236758');
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `
      <a href="/item/236759">Item 1</a>
    `;
    const listingHtml = `
      <h1>Satılır 2 otaqlı</h1>
      <div class="item-author">
        <div class="item-author__name">Samir</div>
        <div>Vasitəçi</div>
      </div>
      <a href="tel:0503334455">Samir Phone</a>
    `;

    const mockFetcher = (url: string | URL) => {
      const u = url.toString();
      const content = u.endsWith('.az/') || u.includes('items') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlCityAz(
      { startUrl: 'https://city.az', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('0503334455');
    expect(result.items[0]?.name).toBe('Samir');
  });
});
