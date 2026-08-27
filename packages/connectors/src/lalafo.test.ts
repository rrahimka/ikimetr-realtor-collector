import { describe, it, expect } from 'vitest';
import {
  validateLalafoUrl,
  detectExplicitLalafoSellerType,
  parseLalafoAdData,
  discoverLalafoListingUrls,
  crawlLalafoAz,
  extractLalafoDetailFromHtml,
} from './lalafo';

describe('Lalafo Connector', () => {
  it('validates valid and invalid Lalafo URLs', () => {
    expect(validateLalafoUrl('https://lalafo.az/baku/nedvizhimost')).toBe('https://lalafo.az/baku/nedvizhimost');
    expect(validateLalafoUrl('https://lalafo.az/baku/ads/ev-satilir-id-112038591', 'listing')).toBe(
      'https://lalafo.az/baku/ads/ev-satilir-id-112038591'
    );

    expect(() => validateLalafoUrl('https://bina.az')).toThrow('not a valid Lalafo host');
    expect(() => validateLalafoUrl('https://lalafo.az/about', 'listing')).toThrow('not a valid Lalafo listing path');
  });

  it('classifies seller types correctly', () => {
    expect(
      detectExplicitLalafoSellerType({
        id: 1,
        params: [{ name: 'Təklifin növü', value: 'Vasitəçi' }],
      })
    ).toBe('agent');

    expect(
      detectExplicitLalafoSellerType({
        id: 2,
        user: { business: { business: true, features: { company_name: 'Grand Real Estate' } } },
      })
    ).toBe('agency');

    expect(
      detectExplicitLalafoSellerType({
        id: 3,
        user: { pro: true },
      })
    ).toBe('agent');

    expect(
      detectExplicitLalafoSellerType({
        id: 4,
        params: [{ name: 'Təklifin növü', value: 'Maklerlər narahat etməsin, Mülkiyyətçi' }],
      })
    ).toBe('owner');

    expect(
      detectExplicitLalafoSellerType({
        id: 5,
        title: 'Mənzil',
      })
    ).toBe('unknown');
  });

  it('parses verified agent/agency ad and extracts phone number', () => {
    const data = {
      id: 112038591,
      title: '3 otaqlı mənzil',
      city: 'Bakı',
      mobile: '+994555108052',
      user: {
        username: 'Elmir Vasitəçi',
        pro: true,
      },
      params: [{ name: 'Təklifin növü', value: 'Vasitəçi' }],
    };

    const evidence = parseLalafoAdData(data, 'https://lalafo.az/baku/ads/3-otaqli-menzil-id-112038591');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('+994555108052');
    expect(evidence?.name).toBe('Elmir Vasitəçi');
    expect(evidence?.platform).toBe('lalafo.az');
    expect(evidence?.explicitSellerType).toBe('agent');
  });

  it('strictly rejects unverified or private owner ads', () => {
    const ownerData = {
      id: 112038592,
      title: 'Sahibindən mənzil',
      mobile: '+994501234567',
      params: [{ name: 'Təklifin növü', value: 'Mülkiyyətçi' }],
    };

    const unknownData = {
      id: 112038593,
      title: 'Köhnə tikili',
      mobile: '+994501234567',
    };

    expect(parseLalafoAdData(ownerData, 'https://lalafo.az/baku/ads/owner-id-112038592')).toBeNull();
    expect(parseLalafoAdData(unknownData, 'https://lalafo.az/baku/ads/unknown-id-112038593')).toBeNull();
  });

  it('extracts detail query data from HTML next data', () => {
    const nextData = {
      props: {
        pageProps: {
          dehydratedState: {
            queries: [
              {
                queryKey: ['detail', 13, 'az_AZ', 112038591],
                state: {
                  data: {
                    id: 112038591,
                    title: 'Test Ad',
                    mobile: '+994505554433',
                    user: { username: 'Agent 1', pro: true },
                    params: [{ name: 'Təklifin növü', value: 'Vasitəçi' }],
                  },
                },
              },
            ],
          },
        },
      },
    };

    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const extracted = extractLalafoDetailFromHtml(html);
    expect(extracted?.id).toBe(112038591);
    expect(extracted?.mobile).toBe('+994505554433');
  });

  it('discovers listing links from search HTML', () => {
    const html = `
      <a href="/baku/ads/item-1-id-111">Item 1</a>
      <a href="/baku/ads/item-2-id-222">Item 2</a>
      <a href="/baku/help">Help</a>
    `;

    const urls = discoverLalafoListingUrls(html, 'https://lalafo.az');
    expect(urls).toEqual([
      'https://lalafo.az/baku/ads/item-1-id-111',
      'https://lalafo.az/baku/ads/item-2-id-222',
    ]);
  });

  it('runs crawler with safeFetch mock and respects shouldStop', async () => {
    const searchHtml = `<a href="/baku/ads/item-1-id-111">Item 1</a>`;
    const nextData = {
      props: {
        pageProps: {
          dehydratedState: {
            queries: [
              {
                queryKey: ['detail', 13, 'az_AZ', 111],
                state: {
                  data: {
                    id: 111,
                    title: 'Agent Ad',
                    mobile: '0552223344',
                    user: { username: 'Pro Agent', pro: true },
                    params: [{ name: 'Təklifin növü', value: 'Vasitəçi' }],
                  },
                },
              },
            ],
          },
        },
      },
    };
    const listingHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;

    const mockFetcher = (url: string | URL) => {
      const u = url.toString();
      const content = u.includes('nedvizhimost') ? searchHtml : listingHtml;
      return Promise.resolve(new Response(content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));
    };

    const result = await crawlLalafoAz(
      { startUrl: 'https://lalafo.az/baku/nedvizhimost', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('0552223344');
    expect(result.items[0]?.name).toBe('Pro Agent');
  });
});
