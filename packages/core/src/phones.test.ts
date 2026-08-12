import { describe, expect, it } from 'vitest';
import { extractPhones, normalizePhone } from './phones.js';

describe('normalizePhone', () => {
  it.each([
    ['050 123 45 67', '+994501234567'],
    ['994 50 123 45 67', '+994501234567'],
    ['+994 (50) 123-45-67', '+994501234567'],
  ])('normalizes Azerbaijani format %s', (input, expected) => {
    expect(normalizePhone(input, 'AZ')).toEqual({
      raw: input,
      normalized: expected,
      isForeign: false,
      isValid: true,
    });
  });

  it.each(['050123', '+994 10', '12345678901234567890'])('rejects invalid number %s', (input) => {
    expect(normalizePhone(input, 'AZ')).toMatchObject({ raw: input, isValid: false });
  });

  it('marks a valid foreign number', () => {
    expect(normalizePhone('+44 20 7946 0958', 'AZ')).toEqual({
      raw: '+44 20 7946 0958',
      normalized: '+442079460958',
      isForeign: true,
      isValid: true,
    });
  });
});

describe('extractPhones', () => {
  it('extracts distinct numbers and keeps their original spelling', () => {
    const result = extractPhones('Makler: 050 123 45 67, ofis +994 12 555 44 33. Təkrar 050 123 45 67.');
    expect(result).toEqual([
      { raw: '050 123 45 67', normalized: '+994501234567', isForeign: false, isValid: true },
      { raw: '+994 12 555 44 33', normalized: '+994125554433', isForeign: false, isValid: true },
    ]);
  });
});
