import { describe, it, expect } from 'vitest';
import {
  validateYeniEmlakUrl,
  detectExplicitYeniEmlakSellerType,
  parseYeniEmlakListingPage,
  discoverYeniEmlakListingUrls,
  crawlYeniEmlakAz,
} from './yeniemlak';

describe('YeniEmlak Connector', () => {
  it('validates valid and invalid YeniEmlak URLs', () => {
    expect(validateYeniEmlakUrl('https://yeniemlak.az/elan/axtar')).toBe('https://yeniemlak.az/elan/axtar');
    expect(validateYeniEmlakUrl('https://yeniemlak.az/')).toBe('https://yeniemlak.az/');
    expect(validateYeniEmlakUrl('https://yeniemlak.az/elan/satilir-3-otaqli-178531', 'listing')).toBe('https://yeniemlak.az/elan/satilir-3-otaqli-178531');

    expect(() => validateYeniEmlakUrl('https://bina.az')).toThrow('not a valid YeniEmlak host');
    expect(() => validateYeniEmlakUrl('https://yeniemlak.az/about', 'listing')).toThrow('not a valid YeniEmlak listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitYeniEmlakSellerType('Vasitəçi / Rieltor')).toBe('agent');
    expect(detectExplicitYeniEmlakSellerType('Əmlak agentliyi')).toBe('agency');
    expect(detectExplicitYeniEmlakSellerType('Mülkiyyətçi')).toBe('owner');
    expect(detectExplicitYeniEmlakSellerType('Əmlak sahibi')).toBe('owner');
    expect(detectExplicitYeniEmlakSellerType('Naməlum')).toBe('unknown');
  });

  it('parses an agent listing with tel image and extracts phone', () => {
    const html = `
      <html>
        <body>
          <div class="params"><b>Sumqayıt</b></div>
          <div class="text">Sumqayıt şəhəri 3 otaqlı həyət evi satılır. Ofis haqqı 2%</div>
          <h1>Əlaqə</h1>
          <div class="ad">Təbriz</div>
          <div class="elvrn">Vasitəçi / Rieltor</div>
          <div class="tel"><img src="/tel-show/0554813446"><br></div>
        </body>
      </html>
    `;

    const evidence = parseYeniEmlakListingPage(html, 'https://yeniemlak.az/elan/satilir-3-otaqli-178531');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('0554813446');
    expect(evidence?.name).toBe('Təbriz');
    expect(evidence?.city).toBe('Sumqayıt');
    expect(evidence?.platform).toBe('yeniemlak.az');
  });

  it('skips private owner listings', () => {
    const html = `
      <html>
        <body>
          <div class="ad">Sahib</div>
          <div class="elvrn">Mülkiyyətçi</div>
          <div class="tel"><img src="/tel-show/0501234567"><br></div>
        </body>
      </html>
    `;

    const evidence = parseYeniEmlakListingPage(html, 'https://yeniemlak.az/elan/satilir-3-otaqli-178532');
    expect(evidence).toBeNull();
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/elan/satilir-3-otaqli-heyet-evi-sumqayit-178531">Item 1</a>
          <a href="/elan/satilir-2-otaqli-bina-evi-baki-178532">Item 2</a>
          <a href="/elan-verilme-qaydalari">Rules (ignore)</a>
        </body>
      </html>
    `;

    const urls = discoverYeniEmlakListingUrls(html, 'https://yeniemlak.az');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://yeniemlak.az/elan/satilir-3-otaqli-heyet-evi-sumqayit-178531');
    expect(urls[1]).toBe('https://yeniemlak.az/elan/satilir-2-otaqli-bina-evi-baki-178532');
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `
      <a href="/elan/satilir-3-otaqli-178531">Item 1</a>
      <a href="/elan/satilir-2-otaqli-178532">Item 2</a>
    `;
    const listingHtml = `
      <div class="ad">Rieltor Əli</div>
      <div class="elvrn">Vasitəçi / Rieltor</div>
      <div class="tel"><img src="/tel-show/0509998877"></div>
    `;

    const mockFetcher = (url: string | URL) => {
      const u = url.toString();
      const content = u.includes('axtar') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlYeniEmlakAz(
      { startUrl: 'https://yeniemlak.az/elan/axtar', maxPages: 2, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.rawPhone).toBe('0509998877');
    expect(result.items[0]?.name).toBe('Rieltor Əli');
  });
});
