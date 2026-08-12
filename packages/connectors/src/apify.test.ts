import { describe, expect, it } from 'vitest';
import { ApifyConfigurationError, getApifyStatus, validateActorInput } from './apify.js';

describe('Apify configuration', () => {
  it('reports not configured without a token instead of breaking startup', () => {
    expect(getApifyStatus({})).toEqual({ configured: false, label: 'Не настроено' });
  });

  it('validates generated input against current actor schema', () => {
    expect(() => validateActorInput({ startUrls: [{ url: 'https://instagram.com/realtor' }], resultsLimit: 20 }, { type: 'object', required: ['directUrls'], properties: { directUrls: { type: 'array' } } })).toThrow(ApifyConfigurationError);
  });
});
