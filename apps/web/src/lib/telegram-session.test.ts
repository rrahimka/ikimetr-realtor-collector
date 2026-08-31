import { describe, expect, it } from 'vitest';
import {
  getTelegramApiCredentials,
  getAuthState,
  getPublicAuthState,
  setAuthState,
  clearAuthState,
} from './telegram-session';

describe('telegram-session', () => {
  it('returns api credentials from env', () => {
    process.env.TELEGRAM_API_ID = '12345';
    process.env.TELEGRAM_API_HASH = 'test_api_hash';
    const creds = getTelegramApiCredentials();
    expect(creds.apiId).toBe(12345);
    expect(creds.apiHash).toBe('test_api_hash');
    delete process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_HASH;
  });

  it('throws when telegram credentials are missing', () => {
    delete process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_HASH;
    expect(() => getTelegramApiCredentials()).toThrow('TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured');
  });

  it('manages auth state in memory with default disconnected state', async () => {
    expect(getAuthState()).toEqual({ status: 'disconnected' });

    setAuthState({ status: 'waiting_code', phoneNumber: '+994501234567', phoneCodeHash: 'hash123' });
    expect(getAuthState().status).toBe('waiting_code');
    expect((getAuthState() as Record<string, unknown>).phoneNumber).toBe('+994501234567');

    setAuthState({ status: 'waiting_2fa', phoneNumber: '+994501234567', phoneCodeHash: 'hash123' });
    expect(getAuthState().status).toBe('waiting_2fa');

    await clearAuthState();
    expect(getAuthState()).toEqual({ status: 'disconnected' });
  });

  it('supports multiple independent session states', () => {
    setAuthState({ status: 'waiting_code', phoneNumber: '+994501111111' }, 'session-a');
    setAuthState({ status: 'connected', accountInfo: { id: 1, firstName: 'A' } }, 'session-b');

    expect(getAuthState('session-a').status).toBe('waiting_code');
    expect(getAuthState('session-b').status).toBe('connected');
    expect(getAuthState('default').status).toBe('disconnected');
  });
});

describe('getPublicAuthState — response redaction', () => {
  it('never exposes phoneCodeHash or the phone number of an in-flight auth', async () => {
    setAuthState({ status: 'waiting_code', phoneNumber: '+994501234567', phoneCodeHash: 'secret_hash' });

    const serialized = JSON.stringify(getPublicAuthState());
    expect(getPublicAuthState()).toEqual({ status: 'waiting_code' });
    expect(serialized).not.toContain('secret_hash');
    expect(serialized).not.toContain('+994501234567');
    await clearAuthState();
  });

  it('does not leak the transient hash during the 2FA step either', async () => {
    setAuthState({ status: 'waiting_2fa', phoneNumber: '+994501234567', phoneCodeHash: 'secret_hash' });
    expect(getPublicAuthState()).toEqual({ status: 'waiting_2fa' });
    await clearAuthState();
  });

  it('exposes the account identity once connected, but still no secrets', async () => {
    setAuthState({ status: 'connected', accountInfo: { id: 42, username: 'baku_realtor' } });
    expect(getPublicAuthState()).toEqual({
      status: 'connected',
      accountInfo: { id: 42, username: 'baku_realtor' },
    });
    await clearAuthState();
  });
});
