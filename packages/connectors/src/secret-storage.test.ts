import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret } from './secret-storage';

describe('connectors secret-storage', () => {
  beforeEach(() => {
    process.env.TELEGRAM_SESSION_SECRET = 'a'.repeat(64);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_SESSION_SECRET;
  });

  it('encrypts and decrypts a session string roundtrip', () => {
    const plaintext = '1AQBoA..test_session_string';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same_session';
    const encrypted1 = encryptSecret(plaintext);
    const encrypted2 = encryptSecret(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptSecret(encrypted1)).toBe(plaintext);
    expect(decryptSecret(encrypted2)).toBe(plaintext);
  });

  it('throws when TELEGRAM_SESSION_SECRET is missing', () => {
    delete process.env.TELEGRAM_SESSION_SECRET;
    expect(() => encryptSecret('test')).toThrow('TELEGRAM_SESSION_SECRET');
    expect(() => decryptSecret('test')).toThrow('TELEGRAM_SESSION_SECRET');
  });

  it('throws on invalid encrypted payload', () => {
    expect(() => decryptSecret('not_valid')).toThrow('Invalid encrypted secret format');
  });
});
