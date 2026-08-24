import { describe, expect, it } from 'vitest';
import { getSourceFormDefaults, SOURCE_TYPE_OPTIONS } from './source-form';

describe('Bina source form configuration', () => {
  it('exposes bina_agency as a production source option', () => {
    expect(SOURCE_TYPE_OPTIONS).toContainEqual({ value: 'bina_agency', labelKey: 'sourceType.binaAgency' });
    expect(SOURCE_TYPE_OPTIONS).not.toContainEqual(expect.objectContaining({ value: 'test_fixture' }));
  });

  it('uses the hard Bina limits when the type is selected', () => {
    expect(getSourceFormDefaults('bina_agency')).toEqual({ maxPages: 100, maxDepth: 0, delayMs: 10_000, language: 'AZ' });
  });

  it('keeps existing generic source defaults unchanged', () => {
    expect(getSourceFormDefaults('website')).toEqual({ maxPages: 10, maxDepth: 1, delayMs: 1_000, language: 'AZ' });
  });
});
