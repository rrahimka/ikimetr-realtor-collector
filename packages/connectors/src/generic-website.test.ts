import { describe, expect, it, vi } from 'vitest';
import { crawlWebsite, safeFetch } from './generic-website.js';

const publicResolver = async () => ['93.184.216.34'];

describe('safeFetch', () => {
  it('checks and rejects every redirect target before requesting it', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'http://127.0.0.1/secret' } }));
    await expect(safeFetch('https://example.com', { fetcher, resolver: publicResolver })).rejects.toThrow('blocked');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('x'.repeat(101), { headers: { 'content-type': 'text/html' } }));
    await expect(safeFetch('https://example.com', { fetcher, resolver: publicResolver, maxBytes: 100 })).rejects.toThrow('response size');
  });
});

describe('crawlWebsite', () => {
  it('honours robots and never fetches a disallowed page', async () => {
    const fetcher = vi.fn(async (input: string | URL) => new Response(String(input).endsWith('/robots.txt') ? 'User-agent: *\nDisallow: /private' : '<p>050 123 45 67</p>', { headers: { 'content-type': 'text/html' } }));
    await expect(crawlWebsite({ startUrl: 'https://example.com/private', maxPages: 2, maxDepth: 1, delayMs: 0 }, { fetcher, resolver: publicResolver })).rejects.toThrow('robots.txt');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('extracts text, tel, and WhatsApp numbers with evidence and same-host traversal', async () => {
    const html = '<html><body><p>Makler 050 123 45 67</p><a href="tel:+994125554433">Call</a><a href="https://wa.me/994707778899">WA</a><a href="/next">Next</a><a href="https://other.example/x">Other</a></body></html>';
    const fetcher = vi.fn(async (input: string | URL) => new Response(String(input).endsWith('/robots.txt') ? 'User-agent: *\nAllow: /' : html, { headers: { 'content-type': 'text/html' } }));
    const result = await crawlWebsite({ startUrl: 'https://example.com/', maxPages: 2, maxDepth: 1, delayMs: 0 }, { fetcher, resolver: publicResolver });
    expect(result.pagesChecked).toBe(2);
    expect(result.items.map((item) => item.rawPhone)).toEqual(expect.arrayContaining(['050 123 45 67', '+994125554433', '994707778899']));
    expect(result.items[0]).toMatchObject({ sourceUrl: 'https://example.com/', locationType: 'listing', platform: 'website' });
    expect(result.items[0]!.excerpt.length).toBeGreaterThan(10);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('other.example'))).toBe(false);
  });
});
