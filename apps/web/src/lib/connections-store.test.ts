import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getConnectionsStore,
  updateAccountConnection,
  updateAccountSearchConfig,
  updateWhatsAppGroupConsent,
  buildConnectAuthorizeResult,
  withoutSessionSecrets,
} from './connections-store';

describe('Connections Store', () => {
  it('loads default connections state with social networks and WhatsApp groups', () => {
    const store = getConnectionsStore();
    expect(store.accounts.instagram).toBeDefined();
    expect(store.accounts.tiktok).toBeDefined();
    expect(store.accounts.facebook).toBeDefined();
    expect(store.accounts.whatsapp).toBeDefined();
    expect(store.accounts.telegram).toBeDefined();
    expect(store.whatsappGroups.length).toBeGreaterThanOrEqual(3);
  });

  it('updates social account connection state and disconnects cleanly', () => {
    const connected = updateAccountConnection('tiktok', {
      status: 'connected',
      accountHandle: '@baku_realtor_tiktok',
    });
    expect(connected.status).toBe('connected');
    expect(connected.accountHandle).toBe('@baku_realtor_tiktok');

    const disconnected = updateAccountConnection('tiktok', {
      status: 'disconnected',
      accountHandle: undefined,
    });
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.accountHandle).toBeUndefined();
  });

  it('updates search configuration surfaces and purpose', () => {
    const updated = updateAccountSearchConfig(
      'instagram',
      ['name_username', 'bio_about', 'comments'],
      'leads',
      false
    );
    expect(updated.enabledSurfaces).toEqual(['name_username', 'bio_about', 'comments']);
    expect(updated.purpose).toBe('leads');
    expect(updated.maxSafePreset).toBe(false);
  });

  it('updates WhatsApp group consent and realtor-only mode', () => {
    const group = updateWhatsAppGroupConsent('wa-group-003', true, false, 'both');
    expect(group).toBeDefined();
    expect(group?.authorized).toBe(true);
    expect(group?.authorizedAt).toBeDefined();

    const revoked = updateWhatsAppGroupConsent('wa-group-003', false);
    expect(revoked?.authorized).toBe(false);
    expect(revoked?.authorizedAt).toBeUndefined();
  });

  it('supports Telegram as a connectable social platform with connect/disconnect/switch', () => {
    // Set Telegram to connected first (previous tests may have modified state)
    updateAccountConnection('telegram', {
      status: 'connected',
      accountHandle: '+994 50 555 12 34',
      accountName: 'MTProto Authorized Connector',
      connectedAt: new Date().toISOString(),
    });
    const initial = getConnectionsStore().accounts.telegram;
    expect(initial.status).toBe('connected');
    expect(initial.accountHandle).toBeDefined();

    // Disconnect
    const disconnected = updateAccountConnection('telegram', {
      status: 'disconnected',
      accountHandle: undefined,
    });
    expect(disconnected.status).toBe('disconnected');
    expect(disconnected.accountHandle).toBeUndefined();

    // Reconnect
    const reconnected = updateAccountConnection('telegram', {
      status: 'connected',
      accountHandle: '+994 50 555 12 34',
      connectedAt: new Date().toISOString(),
    });
    expect(reconnected.status).toBe('connected');
    expect(reconnected.accountHandle).toBe('+994 50 555 12 34');

    // Switch account: revoke old session, enter connecting state
    const switched = updateAccountConnection('telegram', {
      status: 'connecting',
      accountHandle: undefined,
      humanAuthRequired: true,
      humanAuthType: 'browser',
      humanAuthPrompt: 'Подтвердите вход в telegram на вашем устройстве для смены аккаунта.',
    });
    expect(switched.status).toBe('connecting');
    expect(switched.humanAuthRequired).toBe(true);
    expect(switched.accountHandle).toBeUndefined();
  });

  it('supports switch account flow for WhatsApp (re-enter QR auth, revoke old session)', () => {
    // Set WhatsApp to connected first (previous tests may have modified state)
    updateAccountConnection('whatsapp', {
      status: 'connected',
      accountHandle: '+994 50 123 45 67',
      accountName: 'Collector Agent',
      connectedAt: new Date().toISOString(),
    });
    const initial = getConnectionsStore().accounts.whatsapp;
    expect(initial.status).toBe('connected');

    // Switch account: enter QR auth flow
    const switched = updateAccountConnection('whatsapp', {
      status: 'connecting',
      accountHandle: undefined,
      humanAuthRequired: true,
      humanAuthType: 'qr',
    });
    expect(switched.status).toBe('connecting');
    expect(switched.humanAuthType).toBe('qr');
    expect(switched.accountHandle).toBeUndefined();
  });

  it('deselecting a WhatsApp group removes its authorization', () => {
    // Set group 001 to authorized first (previous tests may have modified state)
    updateWhatsAppGroupConsent('wa-group-001', true);
    const initial = getConnectionsStore().whatsappGroups.find((g) => g.id === 'wa-group-001');
    expect(initial?.authorized).toBe(true);

    // Deselect it
    const revoked = updateWhatsAppGroupConsent('wa-group-001', false);
    expect(revoked?.authorized).toBe(false);
    expect(revoked?.authorizedAt).toBeUndefined();

    // Re-authorize
    const reauth = updateWhatsAppGroupConsent('wa-group-001', true);
    expect(reauth?.authorized).toBe(true);
  });

  it('never stores or returns raw secrets (no tokens, cookies or passwords) in connection state', () => {
    const store = withoutSessionSecrets(getConnectionsStore());
    const serialized = JSON.stringify(store).toLowerCase();
    for (const forbidden of ['token', 'secret', 'password', 'cookie', 'session', 'refresh', 'accesstoken', 'accesstok']) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
    // The in-memory shape must also avoid secret-bearing keys.
    const sensitiveKeys = ['token', 'accessToken', 'refreshToken', 'secret', 'password', 'cookie', 'sessionToken'];
    for (const account of Object.values(store.accounts)) {
      for (const key of Object.keys(account)) {
        expect(sensitiveKeys).not.toContain(key);
      }
    }
  });

  it('never returns raw secrets after switch_account or disconnect operations', () => {
    // Simulate switch_account for tiktok
    const switched = updateAccountConnection('tiktok', {
      status: 'connecting',
      accountHandle: undefined,
      humanAuthRequired: true,
      humanAuthType: 'browser',
    });
    const serialized = JSON.stringify(switched).toLowerCase();
    for (const forbidden of ['token', 'secret', 'password', 'cookie', 'accesstoken', 'refreshtoken']) {
      expect(serialized.includes(forbidden)).toBe(false);
    }

    // Simulate disconnect for telegram
    const disconnected = updateAccountConnection('telegram', {
      status: 'disconnected',
      accountHandle: undefined,
    });
    const discSerialized = JSON.stringify(disconnected).toLowerCase();
    for (const forbidden of ['token', 'secret', 'password', 'cookie', 'accesstoken', 'refreshtoken']) {
      expect(discSerialized.includes(forbidden)).toBe(false);
    }
  });

  it('default state has no fake handles or hardcoded credentials', () => {
    const store = getConnectionsStore();
    const fakeHandles = ['@baku_realtor_pilot', '+994 50 123 45 67', '+994 50 555 12 34', 'Collector Agent', 'MTProto Authorized Connector'];
    for (const platform of ['instagram', 'tiktok', 'facebook', 'whatsapp', 'telegram'] as const) {
      const acc = store.accounts[platform];
      expect(fakeHandles).not.toContain(acc.accountHandle);
      expect(acc.integrationStatus).toBeDefined();
    }
  });

  it('buildConnectAuthorizeResult returns needs_credentials when env vars are missing', () => {
    const result = buildConnectAuthorizeResult('instagram', {} as NodeJS.ProcessEnv);
    expect(result.kind).toBe('needs_credentials');
    expect(result.needsCredentials).toBe(true);
    expect(result.authorizeUrl).toBeUndefined();
  });

  it('buildConnectAuthorizeResult returns oauth with authorizeUrl when credentials are present', () => {
    const env = {
      INSTAGRAM_APP_ID: 'test-app-id',
      INSTAGRAM_APP_SECRET: 'test-app-secret',
    } as unknown as NodeJS.ProcessEnv;
    const result = buildConnectAuthorizeResult('instagram', env);
    expect(result.kind).toBe('oauth');
    expect(result.authorizeUrl).toBeDefined();
    expect(result.authorizeUrl).toContain('instagram.com/oauth/authorize');
    expect(result.authorizeUrl).toContain('client_id=test-app-id');
    expect(result.authorizeUrl).toContain('code_challenge=');
    expect(result.authorizeUrl).toContain('code_challenge_method=S256');
  });

  it('buildConnectAuthorizeResult returns mtproto when Telegram credentials are present', () => {
    const env = {
      TELEGRAM_API_ID: '12345',
      TELEGRAM_API_HASH: 'abc123',
      TELEGRAM_SESSION_STRING: 'session123',
    } as unknown as NodeJS.ProcessEnv;
    const result = buildConnectAuthorizeResult('telegram', env);
    expect(result.kind).toBe('mtproto');
    expect(result.authorizeUrl).toBeUndefined();
  });

  it('buildConnectAuthorizeResult returns whatsapp_qr for WhatsApp', () => {
    const result = buildConnectAuthorizeResult('whatsapp', {} as NodeJS.ProcessEnv);
    expect(result.kind).toBe('whatsapp_qr');
  });

  it('integrationStatus is populated on all accounts', () => {
    const store = getConnectionsStore();
    for (const platform of ['instagram', 'tiktok', 'facebook', 'whatsapp', 'telegram'] as const) {
      const acc = store.accounts[platform];
      expect(acc.integrationStatus).toBeDefined();
      expect(['real', 'architecture_ready', 'mock', 'unsupported']).toContain(acc.integrationStatus);
    }
  });

  it('withoutSessionSecrets strips sessionString from all accounts but preserves other fields', () => {
    process.env.TELEGRAM_SESSION_SECRET = 'a'.repeat(64);
    const plaintextSession = 'SECRET_SESSION_STRING_MUST_BE_ENCRYPTED';
    updateAccountConnection('telegram', {
      status: 'connected',
      accountHandle: '@test_telegram',
      sessionString: plaintextSession,
    });
    const store = getConnectionsStore();
    expect(store.accounts.telegram.sessionString).toBe(plaintextSession);

    const sanitized = withoutSessionSecrets(store);
    expect(sanitized.accounts.telegram.sessionString).toBeUndefined();
    expect(sanitized.accounts.telegram.accountHandle).toBe('@test_telegram');
    expect(sanitized.accounts.telegram.status).toBe('connected');
    expect(sanitized.accounts.instagram.sessionString).toBeUndefined();

    updateAccountConnection('telegram', {
      sessionString: undefined,
    });
  });

  it('persists sessionString encrypted on disk, not plaintext', () => {
    process.env.TELEGRAM_SESSION_SECRET = 'b'.repeat(64);
    const plaintextSession = 'PLAINTEXT_SESSION_MUST_NOT_APPEAR_ON_DISK';
    updateAccountConnection('telegram', {
      status: 'connected',
      accountHandle: '@disk_test',
      sessionString: plaintextSession,
    });
    const raw = readFileSync(resolve(process.cwd(), 'data/connections.json'), 'utf8');
    expect(raw).not.toContain(plaintextSession);

    updateAccountConnection('telegram', {
      sessionString: undefined,
    });
  });
});
