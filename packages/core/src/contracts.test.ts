import { describe, expect, it } from 'vitest';
import { sourceSchema } from './contracts';

const binaSource = {
  name: 'Bina.az Agentlik',
  type: 'bina_agency' as const,
  locator: 'https://bina.az/baki/alqi-satqi/menziller',
  language: 'AZ' as const,
  maxPages: 100,
  maxDepth: 0,
  delayMs: 10_000,
  enabled: true,
  killSwitch: false,
};

describe('bina_agency source contract', () => {
  it('accepts only the safe Bina runtime limits', () => {
    expect(sourceSchema.parse(binaSource)).toMatchObject({
      type: 'bina_agency',
      maxPages: 100,
      maxDepth: 0,
      delayMs: 10_000,
    });
  });

  it.each([
    ['more than 100 listings', { maxPages: 101 }],
    ['a crawl depth above zero', { maxDepth: 1 }],
    ['a delay below ten seconds', { delayMs: 9_999 }],
  ])('rejects %s', (_name, override) => {
    expect(() => sourceSchema.parse({ ...binaSource, ...override })).toThrow();
  });

  it('does not impose Bina limits on the artificial fixture source', () => {
    expect(sourceSchema.parse({
      ...binaSource,
      type: 'test_fixture',
      locator: 'fixture://contacts',
      maxPages: 1,
      delayMs: 0,
    })).toMatchObject({ type: 'test_fixture', maxPages: 1, delayMs: 0 });
  });
});
