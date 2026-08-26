import { describe, it, expect } from 'vitest';
import {
  validateEmlakBazariUrl,
  detectExplicitEmlakBazariSellerType,
  parseEmlakBazariListingPage,
  discoverEmlakBazariListingUrls,
  crawlEmlakBazariAz,
} from './emlakbazari';

describe('EmlakBazari Connector', () => {
  it('validates valid and invalid EmlakBazari URLs', () => {
    expect(validateEmlakBazariUrl('https://emlakbazari.az/properties')).toBe('https://emlakbazari.az/properties');
    expect(validateEmlakBazariUrl('https://emlakbazari.az/property/10112262556-satilir-yeni-tikili', 'listing')).toBe(
      'https://emlakbazari.az/property/10112262556-satilir-yeni-tikili'
    );

    expect(() => validateEmlakBazariUrl('https://bina.az')).toThrow('not a valid EmlakBazari host');
    expect(() => validateEmlakBazariUrl('https://emlakbazari.az/about', 'listing')).toThrow('not a valid EmlakBazari listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitEmlakBazariSellerType('Vasitəçi (agent)')).toBe('agent');
    expect(detectExplicitEmlakBazariSellerType('Agentlik')).toBe('agency');
    expect(detectExplicitEmlakBazariSellerType('Mülkiyyətçi')).toBe('owner');
    expect(detectExplicitEmlakBazariSellerType('Şəxsi')).toBe('owner');
    expect(detectExplicitEmlakBazariSellerType('Naməlum')).toBe('unknown');
  });

  it('parses an agent listing, excludes site hotline (+994508395158), and extracts realtor phone', () => {
    const html = `
      <html>
        <body>
          <h1>Satılır yeni tikili 3 otaqlı 146 m², İnşaatçılar m.</h1>
          <div class="property-author">
            <div class="property-author__fullname">Ramil</div>
            <div class="property-author__position">Vasitəçi (agent)</div>
          </div>
          <div class="agency-badge">Agentlik</div>
          <a href="tel:+994508395158">Site Support</a>
          <a href="tel:+994503132728">Realtor Phone</a>
        </body>
      </html>
    `;

    const evidence = parseEmlakBazariListingPage(html, 'https://emlakbazari.az/property/10112262556-satilir-yeni-tikili');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('+994503132728');
    expect(evidence?.name).toBe('Ramil');
    expect(evidence?.platform).toBe('emlakbazari.az');
  });

  it('skips private owner listings', () => {
    const html = `
      <html>
        <body>
          <h1>Satılır həyət evi</h1>
          <div class="property-author">
            <div class="property-author__fullname">Elşən</div>
            <div class="property-author__position">Mülkiyyətçi</div>
          </div>
          <a href="tel:+994501234567">Owner Phone</a>
        </body>
      </html>
    `;

    const evidence = parseEmlakBazariListingPage(html, 'https://emlakbazari.az/property/10112262557-satilir');
    expect(evidence).toBeNull();
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/property/10112262556-satilir-yeni-tikili-3-otaqli">Item 1</a>
          <a href="/property/20092290136-satlr-evvilla-4-otaql">Item 2</a>
          <a href="/about">About</a>
        </body>
      </html>
    `;

    const urls = discoverEmlakBazariListingUrls(html, 'https://emlakbazari.az');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://emlakbazari.az/property/10112262556-satilir-yeni-tikili-3-otaqli');
    expect(urls[1]).toBe('https://emlakbazari.az/property/20092290136-satlr-evvilla-4-otaql');
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `
      <a href="/property/10112262556-satilir">Item 1</a>
    `;
    const listingHtml = `
      <h1>Satılır 2 otaqlı</h1>
      <div class="property-author">
        <div class="property-author__fullname">Fuad</div>
        <div class="property-author__position">Vasitəçi</div>
      </div>
      <a href="tel:0552223344">Fuad Phone</a>
    `;

    const mockFetcher = (url: string | URL) => {
      const u = url.toString();
      const content = u.includes('properties') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlEmlakBazariAz(
      { startUrl: 'https://emlakbazari.az/properties?announcement=satilir', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('0552223344');
    expect(result.items[0]?.name).toBe('Fuad');
  });
});
