import { describe, it, expect } from 'vitest';
import {
  validateIpotekaUrl,
  detectExplicitIpotekaSellerType,
  parseIpotekaListingPage,
  discoverIpotekaListingUrls,
  crawlIpotekaAz,
} from './ipoteka';

describe('Ipoteka Connector', () => {
  it('validates valid and invalid Ipoteka URLs', () => {
    expect(validateIpotekaUrl('https://ipoteka.az')).toBe('https://ipoteka.az/');
    expect(validateIpotekaUrl('https://ipoteka.az/elan/159982-satilir', 'listing')).toBe('https://ipoteka.az/elan/159982-satilir');

    expect(() => validateIpotekaUrl('https://bina.az')).toThrow('not a valid Ipoteka host');
    expect(() => validateIpotekaUrl('https://ipoteka.az/about', 'listing')).toThrow('not a valid Ipoteka listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitIpotekaSellerType('Natiq ( Vasitəçi )')).toBe('agent');
    expect(detectExplicitIpotekaSellerType('Rieltor ( Agentlik )')).toBe('agency');
    expect(detectExplicitIpotekaSellerType('Ülvi ( Mülkiyyətçi )')).toBe('owner');
    expect(detectExplicitIpotekaSellerType('Naməlum')).toBe('unknown');
  });

  it('parses an agent listing and extracts phone', () => {
    const html = `
      <html>
        <body>
          <h1>Satılır 3 otaqlı mənzil, Bakı</h1>
          <div class="contact">Natiq ( Vasitəçi )</div>
          <div class="phone sayfind">+994 50 838 07 07</div>
        </body>
      </html>
    `;

    const evidence = parseIpotekaListingPage(html, 'https://ipoteka.az/elan/159982-satilir');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('+994 50 838 07 07');
    expect(evidence?.name).toBe('Natiq');
    expect(evidence?.platform).toBe('ipoteka.az');
  });

  it('skips private owner listings', () => {
    const html = `
      <html>
        <body>
          <h1>Satılır mənzil</h1>
          <div class="contact">Ülvi ( Mülkiyyətçi )</div>
          <div class="phone sayfind">+994 50 111 22 33</div>
        </body>
      </html>
    `;

    const evidence = parseIpotekaListingPage(html, 'https://ipoteka.az/elan/159983-satilir');
    expect(evidence).toBeNull();
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/elan/159982-satilir-serifzade-kucesi">Item 1</a>
          <a href="/elan/158602-satilir-sumqayit">Item 2</a>
          <a href="/about">About</a>
        </body>
      </html>
    `;

    const urls = discoverIpotekaListingUrls(html, 'https://ipoteka.az');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://ipoteka.az/elan/159982-satilir-serifzade-kucesi');
    expect(urls[1]).toBe('https://ipoteka.az/elan/158602-satilir-sumqayit');
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `
      <a href="/elan/159982-satilir">Item 1</a>
    `;
    const listingHtml = `
      <h1>Satılır 2 otaqlı</h1>
      <div class="contact">Vaqif ( Vasitəçi )</div>
      <div class="phone sayfind">055 777 88 99</div>
    `;

    const mockFetcher = (url: string | URL) => {
      const u = url.toString();
      const content = u.endsWith('.az/') || u.includes('elanlar') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlIpotekaAz(
      { startUrl: 'https://ipoteka.az', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('055 777 88 99');
    expect(result.items[0]?.name).toBe('Vaqif');
  });
});
