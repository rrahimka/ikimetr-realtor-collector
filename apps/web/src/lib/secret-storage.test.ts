import { describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret } from './secret-storage';

describe('secret-storage', () => {
  it('encrypts and decrypts a session string roundtrip', () => {
    process.env.TELEGRAM_SESSION_SECRET = 'a'.repeat(64);
    const plaintext = 'telegram_session_string_abc123';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(plaintext.length);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext', () => {
    process.env.TELEGRAM_SESSION_SECRET = 'b'.repeat(64);
    const plaintext = 'same_session';
    const encrypted1 = encryptSecret(plaintext);
    const encrypted2 = encryptSecret(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptSecret(encrypted1)).toBe(plaintext);
    expect(decryptSecret(encrypted2)).toBe(plaintext);
  });

  it('throws when TELEGRAM_SESSION_SECRET is missing', () => {
    delete process.env.TELEGRAM_SESSION_SECRET;
    expect(() => encryptSecret('test')).toThrow('TELEGRAM_SESSION_SECRET environment variable is not set');
    expect(() => decryptSecret('test')).toThrow('TELEGRAM_SESSION_SECRET environment variable is not set');
  });

  it('throws when TELEGRAM_SESSION_SECRET has invalid format', () => {
    process.env.TELEGRAM_SESSION_SECRET = 'short';
    expect(() => encryptSecret('test')).toThrow('TELEGRAM_SESSION_SECRET must be a 64-character hex string');
    expect(() => decryptSecret('test')).toThrow('TELEGRAM_SESSION_SECRET must be a 64-character hex string');
  });

  it('throws on invalid encrypted payload', () => {
    process.env.TELEGRAM_SESSION_SECRET = 'c'.repeat(64);
    expect(() => decryptSecret('not_valid_base64_or_too_short')).toThrow('Invalid encrypted secret format');
  });
});
