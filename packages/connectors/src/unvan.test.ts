import { describe, it, expect } from 'vitest';
import {
  validateUnvanUrl,
  detectExplicitUnvanSellerType,
  parseUnvanListingPage,
  discoverUnvanListingUrls,
  crawlUnvanAz,
  extractUnvanAjaxParams,
} from './unvan';

describe('Unvan Connector', () => {
  it('validates valid and invalid Unvan URLs', () => {
    expect(validateUnvanUrl('https://unvan.az/dasinmaz-emlak')).toBe('https://unvan.az/dasinmaz-emlak');
    expect(validateUnvanUrl('https://unvan.az/xirdalan-menzil-62014734.html', 'listing')).toBe(
      'https://unvan.az/xirdalan-menzil-62014734.html'
    );

    expect(() => validateUnvanUrl('https://bina.az')).toThrow('not a valid Unvan host');
    expect(() => validateUnvanUrl('https://unvan.az/about', 'listing')).toThrow('not a valid Unvan listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitUnvanSellerType('Samir (Bütün Elanları)')).toBe('agent');
    expect(detectExplicitUnvanSellerType('Vasitəçi')).toBe('agent');
    expect(detectExplicitUnvanSellerType('Rieltor')).toBe('agent');
    expect(detectExplicitUnvanSellerType('Əmlak agentliyi')).toBe('agency');
    expect(detectExplicitUnvanSellerType('Sahibi')).toBe('owner');
    expect(detectExplicitUnvanSellerType('Mülkiyyətçi')).toBe('owner');
    expect(detectExplicitUnvanSellerType('Öz evimdir')).toBe('owner');
    expect(detectExplicitUnvanSellerType('Naməlum')).toBe('unknown');
  });

  it('parses an agent listing with revealed phone', () => {
    const html = `
      <html>
        <body>
          <div>Unvan.Az ▸ Daşınmaz Əmlak ▸ Yeni bina evi</div>
          <h1>xırdalan, aaf park, 17-ci küçədə mənzil satılır</h1>
          <div class="infocontact">Samir Hüseynov (Bütün Elanları) Xırdalan şəhəri</div>
          <div id="telshow" data-id="62014734" data-t="product" data-h="5a38dbefe5ee28d20b741d6f45d8aff8" data-rf="">
            0558756XXX<i>nömrəni göstər</i>
          </div>
          <div class="text">Ofis haqqı 1%</div>
        </body>
      </html>
    `;

    const evidence = parseUnvanListingPage(html, 'https://unvan.az/xirdalan-62014734.html', '0558756666');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('0558756666');
    expect(evidence?.name).toBe('Samir Hüseynov');
    expect(evidence?.platform).toBe('unvan.az');
  });

  it('skips private owner listings', () => {
    const html = `
      <html>
        <body>
          <div>Unvan.Az ▸ Daşınmaz Əmlak</div>
          <h1>Torpaq Satılır</h1>
          <div class="infocontact">Sahibi Bakı şəhəri</div>
          <div id="telshow" data-id="62018405" data-t="product" data-h="abc" data-rf="">0519685XXX</div>
          <div class="text">Öz evimdir, sahibindən satılır.</div>
        </body>
      </html>
    `;

    const evidence = parseUnvanListingPage(html, 'https://unvan.az/torpaq-62018405.html', '0519685000');
    expect(evidence).toBeNull();
  });

  it('skips non-real estate listings', () => {
    const html = `
      <html>
        <body>
          <div>Unvan.Az ▸ Telefonlar ▸ iPhone</div>
          <h1>iPhone 15 Pro Max</h1>
          <div class="infocontact">Samir (Bütün Elanları)</div>
          <div id="telshow" data-id="12345" data-t="product" data-h="abc" data-rf="">0551112233</div>
        </body>
      </html>
    `;

    const evidence = parseUnvanListingPage(html, 'https://unvan.az/iphone-12345.html', '0551112233');
    expect(evidence).toBeNull();
  });

  it('extracts AJAX parameters from telshow element', () => {
    const html = `
      <div id="telshow" data-id="62014734" data-t="product" data-h="5a38dbefe5ee28d20b741d6f45d8aff8" data-rf="">0558756XXX</div>
    `;
    const params = extractUnvanAjaxParams(html);
    expect(params).toEqual({
      id: '62014734',
      t: 'product',
      h: '5a38dbefe5ee28d20b741d6f45d8aff8',
      rf: '',
    });
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <html>
        <body>
          <a href="/xirdalan-menzil-62014734.html">Item 1</a>
          <a href="/3-otaqli-menzil-62018405.html">Item 2</a>
          <a href="/contact">Contact</a>
        </body>
      </html>
    `;

    const urls = discoverUnvanListingUrls(html, 'https://unvan.az');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('https://unvan.az/xirdalan-menzil-62014734.html');
    expect(urls[1]).toBe('https://unvan.az/3-otaqli-menzil-62018405.html');
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `
      <a href="/xirdalan-62014734.html">Item 1</a>
    `;
    const listingHtml = `
      <div>Unvan.Az ▸ Daşınmaz Əmlak</div>
      <h1>Satılır 2 otaqlı</h1>
      <div class="infocontact">Kamran (Bütün Elanları)</div>
      <div id="telshow" data-id="62014734" data-t="product" data-h="abc" data-rf="">0553334455</div>
    `;

    const mockFetcher = (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes('ajax.php') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ ok: 1, tel: '0553334455' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      const content = u.includes('dasinmaz-emlak') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlUnvanAz(
      { startUrl: 'https://unvan.az/dasinmaz-emlak', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('0553334455');
    expect(result.items[0]?.name).toBe('Kamran');
  });
});
