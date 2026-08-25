import { describe, expect, it } from 'vitest';
import {
  discoverBinaListingUrlsFromSitemaps,
  extractDeclaredBinaSitemapUrls,
  validateBinaSitemapRequest,
  type BinaSitemapFetch,
} from './bina-sitemap';

const indexUrl = 'https://bina.azstatic.com/uploads/sitemaps/sitemap_index.xml';
const declared = new Set([indexUrl]);

describe('validateBinaSitemapRequest', () => {
  it.each(['GET', 'HEAD'] as const)('allows %s for a declared exact-host sitemap URL', (method) => {
    expect(validateBinaSitemapRequest(indexUrl, method, declared)).toBe(indexUrl);
  });

  it.each([
    'https://bina.azstatic.com.evil.test/uploads/sitemaps/sitemap_index.xml',
    'https://cdn.bina.azstatic.com/uploads/sitemaps/sitemap_index.xml',
    'https://bina.azstatic.com/assets/app.js',
    'http://bina.azstatic.com/uploads/sitemaps/sitemap_index.xml',
    'https://user:password@bina.azstatic.com/uploads/sitemaps/sitemap_index.xml',
  ])('rejects a disallowed sitemap URL %s', (url) => {
    expect(() => validateBinaSitemapRequest(url, 'GET', new Set([url]))).toThrow('Bina sitemap request is not allowed');
  });

  it('rejects methods other than GET and HEAD', () => {
    expect(() => validateBinaSitemapRequest(indexUrl, 'POST', declared)).toThrow('Bina sitemap request is not allowed');
  });

  it('rejects an exact-host sitemap URL that was not declared', () => {
    expect(() => validateBinaSitemapRequest(indexUrl, 'GET', new Set())).toThrow('Bina sitemap request is not allowed');
  });

  it('rejects a redirect to a foreign host even if the redirect URL is declared', () => {
    const redirect = 'https://evil.test/uploads/sitemaps/sitemap_items.xml';
    expect(() => validateBinaSitemapRequest(redirect, 'GET', new Set([redirect]))).toThrow('Bina sitemap request is not allowed');
  });
});

function xmlResponse(body: string, options: { status?: number; location?: string; contentLength?: number } = {}): Response {
  const headers = new Headers({ 'content-type': 'application/xml' });
  if (options.location) headers.set('location', options.location);
  if (options.contentLength !== undefined) headers.set('content-length', String(options.contentLength));
  return new Response(body, { status: options.status ?? 200, headers });
}

describe('extractDeclaredBinaSitemapUrls', () => {
  it('keeps only exact allowed sitemap URLs declared by robots.txt', () => {
    const robots = [
      'User-agent: *',
      `Sitemap: ${indexUrl}`,
      'Sitemap: https://bina.azstatic.com/assets/not-allowed.xml',
      'Sitemap: https://cdn.bina.azstatic.com/uploads/sitemaps/not-allowed.xml',
      `Sitemap: ${indexUrl}`,
    ].join('\n');

    expect(extractDeclaredBinaSitemapUrls(robots)).toEqual([indexUrl]);
  });
});

describe('discoverBinaListingUrlsFromSitemaps', () => {
  it('follows declared sitemap indexes, canonicalizes listing URLs, deduplicates, and caps results', async () => {
    const childUrl = 'https://bina.azstatic.com/uploads/sitemaps/sitemap_items_1.xml';
    const requested: Array<{ url: string; method: string | undefined; redirect: RequestRedirect | undefined }> = [];
    const fetch: BinaSitemapFetch = (input, init) => {
      const url = String(input);
      requested.push({ url, method: init?.method, redirect: init?.redirect });
      if (url === indexUrl) {
        return Promise.resolve(xmlResponse(`<sitemapindex><sitemap><loc>${childUrl}</loc></sitemap></sitemapindex>`));
      }
      if (url === childUrl) {
        return Promise.resolve(xmlResponse([
          '<urlset>',
          '<url><loc>https://www.bina.az/items/000101</loc></url>',
          '<url><loc>https://bina.az/items/101/</loc></url>',
          '<url><loc>https://evil.test/items/102</loc></url>',
          '<url><loc>https://bina.az/items/102</loc></url>',
          '<url><loc>https://bina.az/items/103</loc></url>',
          '</urlset>',
        ].join('')));
      }
      throw new Error(`Unexpected fixture URL: ${url}`);
    };

    const urls = await discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 2,
      fetch,
    });

    expect(urls).toEqual(['https://bina.az/items/101', 'https://bina.az/items/102']);
    expect(requested).toEqual([
      { url: indexUrl, method: 'GET', redirect: 'manual' },
      { url: childUrl, method: 'GET', redirect: 'manual' },
    ]);
  });

  it('does not fetch foreign-host or wrong-path children from an allowed sitemap index', async () => {
    const requested: string[] = [];
    const fetch: BinaSitemapFetch = (input) => {
      requested.push(String(input));
      return Promise.resolve(xmlResponse([
        '<sitemapindex>',
        '<sitemap><loc>https://evil.test/uploads/sitemaps/foreign.xml</loc></sitemap>',
        '<sitemap><loc>https://bina.azstatic.com/assets/wrong-path.xml</loc></sitemap>',
        '</sitemapindex>',
      ].join('')));
    };

    await expect(discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 5,
      fetch,
    })).resolves.toEqual([]);
    expect(requested).toEqual([indexUrl]);
  });

  it('rejects redirects outside the exact sitemap host and path prefix', async () => {
    const fetch: BinaSitemapFetch = () => Promise.resolve(xmlResponse('', {
      status: 302,
      location: 'https://evil.test/uploads/sitemaps/redirected.xml',
    }));

    await expect(discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 5,
      fetch,
    })).rejects.toThrow('Bina sitemap redirect is not allowed');
  });

  it.each([
    ['DOCTYPE', '<!DOCTYPE urlset><urlset></urlset>'],
    ['ENTITY', '<!ENTITY x "unsafe"><urlset></urlset>'],
  ])('rejects XML containing %s declarations', async (_name, body) => {
    const fetch: BinaSitemapFetch = () => Promise.resolve(xmlResponse(body));
    await expect(discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 5,
      fetch,
    })).rejects.toThrow('Bina sitemap XML is not allowed');
  });

  it('enforces response byte and loc-count limits', async () => {
    const oversizedFetch: BinaSitemapFetch = () => Promise.resolve(xmlResponse('<urlset></urlset>', { contentLength: 101 }));
    await expect(discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 5,
      fetch: oversizedFetch,
      maxBytes: 100,
    })).rejects.toThrow('Bina sitemap exceeds the byte limit');

    const tooManyLocsFetch: BinaSitemapFetch = () => Promise.resolve(xmlResponse(
      '<urlset><url><loc>https://bina.az/items/1</loc></url><url><loc>https://bina.az/items/2</loc></url></urlset>',
    ));
    await expect(discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 5,
      fetch: tooManyLocsFetch,
      maxLocs: 1,
    })).rejects.toThrow('Bina sitemap exceeds the loc limit');
  });

  it('returns no URLs when an allowed urlset contains no canonical public listing paths', async () => {
    const fetch: BinaSitemapFetch = () => Promise.resolve(xmlResponse(
      '<urlset><url><loc>https://bina.az/agents/1</loc></url></urlset>',
    ));
    await expect(discoverBinaListingUrlsFromSitemaps({
      robotsText: `Sitemap: ${indexUrl}`,
      maxListings: 5,
      fetch,
    })).resolves.toEqual([]);
  });
});
