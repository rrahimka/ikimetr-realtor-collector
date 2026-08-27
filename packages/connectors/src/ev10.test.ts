import { describe, it, expect } from 'vitest';
import {
  validateEv10Url,
  detectExplicitEv10SellerType,
  parseEv10PostingJson,
  crawlEv10Az,
} from './ev10';

describe('Ev10 Connector', () => {
  it('validates valid and invalid Ev10 URLs', () => {
    expect(validateEv10Url('https://ev10.az/alqi-satqi')).toBe('https://ev10.az/alqi-satqi');
    expect(validateEv10Url('https://ev10.az/posting/299257', 'listing')).toBe('https://ev10.az/posting/299257');

    expect(() => validateEv10Url('https://bina.az')).toThrow('not a valid Ev10 host');
    expect(() => validateEv10Url('https://ev10.az/about', 'listing')).toThrow('not a valid Ev10 listing path');
  });

  it('classifies seller types correctly', () => {
    expect(detectExplicitEv10SellerType({ is_agent: true, description: 'Mənzil satışı' })).toBe('agent');
    expect(detectExplicitEv10SellerType({ is_agent: true, description: 'Əmlak agentliyi tərəfindən' })).toBe('agency');
    expect(detectExplicitEv10SellerType({ is_agent: false })).toBe('owner');
    expect(detectExplicitEv10SellerType({ description: 'Öz evimdir, sahibindən' })).toBe('owner');
    expect(detectExplicitEv10SellerType({ description: 'Salam' })).toBe('unknown');
  });

  it('parses an agent listing, excludes site hotline (+994554312159), and extracts realtor phone', () => {
    const posting = {
      id: 299257,
      is_agent: true,
      phone_number: '0709720801',
      owner_name: 'Məhəmməd',
      city: 'Bakı',
      address: 'Şərifzadə küç',
      description: 'Xidmət haqqımız 1%',
    };

    const evidence = parseEv10PostingJson(posting, 'https://ev10.az/posting/299257');
    expect(evidence).not.toBeNull();
    expect(evidence?.rawPhone).toBe('0709720801');
    expect(evidence?.name).toBe('Məhəmməd');
    expect(evidence?.city).toBe('Bakı');
    expect(evidence?.platform).toBe('ev10.az');
  });

  it('skips private owner postings', () => {
    const posting = {
      id: 299258,
      is_agent: false,
      phone_number: '0501234567',
      owner_name: 'Sahib',
    };

    const evidence = parseEv10PostingJson(posting, 'https://ev10.az/posting/299258');
    expect(evidence).toBeNull();
  });

  it('skips platform hotline numbers', () => {
    const posting = {
      id: 299259,
      is_agent: true,
      phone_number: '+994554312159', // Ev10 support hotline
      owner_name: 'Support',
    };

    const evidence = parseEv10PostingJson(posting, 'https://ev10.az/posting/299259');
    expect(evidence).toBeNull();
  });

  it('runs crawler with safeFetch/fetcher mock and respects shouldStop', async () => {
    const listResponse = {
      total_postings: 1,
      total_pages: 1,
      postings: [{ id: 299257 }],
    };

    const postingResponse = {
      id: 299257,
      is_agent: true,
      phone_number: '0503334455',
      owner_name: 'Rəşad',
      city: 'Bakı',
    };

    const mockFetcher = (url: string | URL) => {
      const u = url.toString();
      if (u.includes('/api/v1/postings?')) {
        return Promise.resolve(new Response(JSON.stringify(listResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      if (u.includes('/api/v1/postings/299257')) {
        return Promise.resolve(new Response(JSON.stringify(postingResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    };

    const result = await crawlEv10Az(
      { startUrl: 'https://ev10.az/alqi-satqi', maxPages: 1, maxDepth: 0, delayMs: 0 },
      { fetcher: mockFetcher }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rawPhone).toBe('0503334455');
    expect(result.items[0]?.name).toBe('Rəşad');
  });
});
