import { describe, expect, it } from 'vitest';
import { parseGoogleMapsCsv } from './google-maps-csv.js';

describe('parseGoogleMapsCsv', () => {
  it('maps gosom rows, normalizes phones, and deduplicates repeats', () => {
    const csv = 'title,category,phone,website,address,link\nBaku Homes,Real Estate Agency,050 123 45 67,https://bakuhomes.az,Nizami 10,https://maps.google.com/a\nBaku Homes,Real Estate Agency,+994501234567,https://bakuhomes.az,Nizami 10,https://maps.google.com/a';
    expect(parseGoogleMapsCsv(csv)).toEqual([{ name: 'Baku Homes', category: 'Real Estate Agency', rawPhone: '050 123 45 67', normalizedPhone: '+994501234567', website: 'https://bakuhomes.az', address: 'Nizami 10', sourceUrl: 'https://maps.google.com/a' }]);
  });
});
