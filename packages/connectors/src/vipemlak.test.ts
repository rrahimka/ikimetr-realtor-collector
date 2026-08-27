import { describe, it, expect } from 'vitest';
import {
  validateVipEmlakUrl,
  detectExplicitVipEmlakSellerType,
  parseVipEmlakListingPage,
  discoverVipEmlakListingUrls,
  crawlVipEmlakAz,
  extractVipEmlakAjaxParams,
} from './vipemlak';

describe('VIPemlak Connector', () => {
  it('validates valid and invalid VIPemlak URLs', () => {
    expect(validateVipEmlakUrl('https://vipemlak.az/elanlar')).toBe('https://vipemlak.az/elanlar');
    expect(validateVipEmlakUrl('https://vipemlak.az/bineqedi-799415.html', 'listing')).toBe(
      'https://vipemlak.az/bineqedi-799415.html'
    );

    expect(() => validateVipEmlakUrl('https://bina.az')).toThrow('not a valid VIPemlak host');
    expect(() => validateVipEmlakUrl('https://vipemlak.az/about', 'listing')).toThrow('not a valid VIPemlak listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitVipEmlakSellerType('Fərhad (Bütün Elanları)')).toBe('agent');
    expect(detectExplicitVipEmlakSellerType('Vasitəçi')).toBe('agent');
    expect(detectExplicitVipEmlakSellerType('Rieltor')).toBe('agent');
    expect(detectExplicitVipEmlakSellerType('Əmlak agentliyi')).toBe('agency');
    expect(detectExplicitVipEmlakSellerType('Sahibi')).toBe('owner');
    expect(detectExplicitVipEmlakSellerType('Mülkiyyətçi')).toBe('owner');
    expect(detectExplicitVipEmlakSellerType('Öz evimdir')).toBe('owner');
    expect(detectExplicitVipEmlakSellerType('Naməlum')).toBe('unknown');
  });

  it('parses an agent listing with revealed phone', () => {
    const html = `
      <html>
        <body>
          <h1>Binəqədi rayonunda 3 otaqlı Köhnə tikili Satılır</h1>
          <div class="infocontact">Fərhad (Bütün Elanları) Bakı şəhəri</div>
          <div id="telshow" data-id="799415" data-t="homeobject" data-h="834e89aaf0cced5d0ff19ee14f67b51d" data-rf="">
            0506747XXX<i>nömrəni göstər</i>
          </div>
          <div class="text">Ofis haqqı 1%</div>
        </body>
      </html>
    `;

    const evidence = parseVipEmlakListingPage(html, 'https://vipemlak.az/bineqedi-799415.html', '0506747837,0506290982');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('0506747837');
    expect(evidence?.name).toBe('Fərhad');
    expect(evidence?.platform).toBe('vipemlak.az');
  });

  it('skips private owner listings', () => {
    const html = `
      <html>
        <body>
          <h1>Torpaq Satılır</h1>
          <div class="infocontact">Sahibi Bakı şəhəri</div>
          <div id="telshow" data-id="795742" data-t="homeobject" data-h="abc" data-rf="">0519685XXX</div>
          <div class="text">Öz torpağımdır, sahibindən satılır.</div>
        </body>
      </html>
    `;

    const evidence = parseVipEmlakListingPage(html, 'https://vipemlak.az/torpaq-795742.html', '0519685000');
    expect(evidence).toBeNull();
  });

  it('extracts AJAX parameters from telshow element', () => {
    const html = `
      <div id="telshow" data-id="799415" data-t="homeobject" data-h="834e89aaf0cced5d0ff19ee14f67b51d" data-rf="">0506747XXX</div>
    `;
    const params = extractVipEmlakAjaxParams(html);
    expect(params).toEqual({
      id: '799415',
      t: 'homeobject',
      h: '834e89aaf0cced5d0ff19ee14f67b51d',
      rf: '',
    });
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/bineqedi-799415.html">Item 1</a>
          <a href="/kohne-gunesli-797897.html">Item 2</a>
          <a href="/contact">Contact</a>
        </body>
      </html>
    `;

    const urls = discoverVipEmlakListingUrls(html, 'https://vipemlak.az');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://vipemlak.az/bineqedi-799415.html');
    expect(urls[1]).toBe('https://vipemlak.az/kohne-gunesli-797897.html');
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `
      <a href="/bineqedi-799415.html">Item 1</a>
    `;
    const listingHtml = `
      <h1>Satılır 2 otaqlı</h1>
      <div class="infocontact">Kamran (Bütün Elanları)</div>
      <div id="telshow" data-id="799415" data-t="homeobject" data-h="abc" data-rf="">0553334455</div>
    `;

    const mockFetcher = (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes('ajax.php') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ ok: 1, tel: '0553334455' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      const content = u.includes('elanlar') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlVipEmlakAz(
      { startUrl: 'https://vipemlak.az/elanlar', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('0553334455');
    expect(result.items[0]?.name).toBe('Kamran');
  });
});
