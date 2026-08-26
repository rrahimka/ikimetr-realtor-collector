import { describe, expect, it, vi } from 'vitest';
import { validateArendaUrl, detectExplicitArendaSellerType, discoverArendaListingUrls, parseArendaListingPage, crawlArendaAz } from './arenda.js';

const publicResolver = (): Promise<string[]> => Promise.resolve(['93.184.216.34']);

describe('Arenda.az connector', () => {
  it('validates Arenda.az URLs', () => {
    expect(validateArendaUrl('https://arenda.az/kiraye-evler')).toBe('https://arenda.az/kiraye-evler');
    expect(() => validateArendaUrl('http://arenda.az/123')).toThrow();
    expect(() => validateArendaUrl('https://other.az/123')).toThrow();
  });

  it('detects seller types correctly', () => {
    expect(detectExplicitArendaSellerType('Agentlik "Caspian Real Estate"')).toBe('agency');
    expect(detectExplicitArendaSellerType('Vasitəçi Murad')).toBe('agent');
    expect(detectExplicitArendaSellerType('Mülkiyyətçi, şəxsi ev')).toBe('owner');
  });

  it('discovers listing URLs and parses agency listing', () => {
    const searchHtml = '<a href="/elan/12345.html">Mənzil</a>';
    const urls = discoverArendaListingUrls(searchHtml, 'https://arenda.az');
    expect(urls).toEqual(['https://arenda.az/elan/12345.html']);

    const listingHtml = `
      <html>
        <body>
          <h1>Xətaidə 2 otaqlı kirayə</h1>
          <div class="agent_info">Agentlik "Elit Emlak"</div>
          <div class="location">Bakı, Xətai</div>
          <a href="tel:+994701234567">Zəng et</a>
        </body>
      </html>
    `;
    const parsed = parseArendaListingPage(listingHtml, 'https://arenda.az/elan/12345.html');
    expect(parsed).not.toBeNull();
    expect(parsed?.rawPhone).toBe('+994701234567');
    expect(parsed?.explicitSellerType).toBe('agency');
    expect(parsed?.city).toBe('Bakı');
  });

  it('crawls Arenda.az with mocks', async () => {
    const searchHtml = '<a href="/elan/555.html">Elan</a>';
    const listingHtml = '<div class="agent_info">Vasitəçi</div><a href="tel:+994504443322">050-444-33-22</a>';

    const fetcher = vi.fn((url: string | URL) => {
      if (String(url).includes('/555.html')) {
        return Promise.resolve(new Response(listingHtml, { headers: { 'content-type': 'text/html' } }));
      }
      return Promise.resolve(new Response(searchHtml, { headers: { 'content-type': 'text/html' } }));
    });

    const res = await crawlArendaAz({ startUrl: 'https://arenda.az/alqi-satqi', maxPages: 2, maxDepth: 0, delayMs: 0 }, { fetcher, resolver: publicResolver });
    expect(res.pagesChecked).toBe(2);
    expect(res.items[0]?.rawPhone).toBe('+994504443322');
    expect(res.items[0]?.explicitSellerType).toBe('agent');
  });

  it('discovers modern Arenda slug-style listing URLs and ignores static pages', () => {
    const html = `
      <a href="/kiraye-ayliq-3-otaqli-yeni-tikili-nerimanov">Mənzil 1</a>
      <a href="/alqi-satqi-2-otaqli-menzil-xetai">Mənzil 2</a>
      <a href="/haqqimizda">About</a>
      <a href="/elaqe">Contact</a>
    `;
    const urls = discoverArendaListingUrls(html, 'https://arenda.az');
    expect(urls).toContain('https://arenda.az/kiraye-ayliq-3-otaqli-yeni-tikili-nerimanov');
    expect(urls).toContain('https://arenda.az/alqi-satqi-2-otaqli-menzil-xetai');
    expect(urls).not.toContain('https://arenda.az/haqqimizda');
    expect(urls).not.toContain('https://arenda.az/elaqe');
  });

  it('excludes Arenda platform hotline from listing phones', () => {
    const listingHtml = `
      <div class="agent_info">Agentlik</div>
      <a href="tel:+994705962424">Support</a>
    `;
    const parsed = parseArendaListingPage(listingHtml, 'https://arenda.az/kiraye-123');
    expect(parsed).toBeNull();
  });

  it('stops crawling Arenda when shouldStop returns true', async () => {
    const searchHtml = '<a href="/elan/1.html">1</a><a href="/elan/2.html">2</a>';
    const fetcher = vi.fn(() => Promise.resolve(new Response(searchHtml, { headers: { 'content-type': 'text/html' } })));
    const res = await crawlArendaAz({ startUrl: 'https://arenda.az/kiraye-menziller', maxPages: 5, maxDepth: 0, delayMs: 0, shouldStop: () => 'cancelled' }, { fetcher, resolver: publicResolver });
    expect(res.pagesChecked).toBe(1);
  });
});
