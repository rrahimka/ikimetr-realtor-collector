import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { encryptSecret } from './secret-storage';
import { restoreTelegramClient } from './telegram-session-restore';

const DATA_DIR = resolve(process.cwd(), 'data');
const STORE_PATH = resolve(DATA_DIR, 'connections.json');

describe('telegram-session-restore', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TELEGRAM_SESSION_SECRET = 'a'.repeat(64);
    process.env.TELEGRAM_API_ID = '12345';
    process.env.TELEGRAM_API_HASH = 'test_hash_value';
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
  });

  it('returns undefined when connections store does not exist', async () => {
    if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
    const result = await restoreTelegramClient(process.env);
    expect(result).toBeUndefined();
  });

  it('returns undefined when TELEGRAM_API_ID is missing', async () => {
    delete process.env.TELEGRAM_API_ID;
    writeFileSync(STORE_PATH, JSON.stringify({
      accounts: {
        telegram: {
          platform: 'telegram',
          status: 'connected',
          sessionString: encryptSecret('test_session'),
        },
      },
    }));
    const result = await restoreTelegramClient(process.env);
    expect(result).toBeUndefined();
  });

  it('returns undefined when no session string in store', async () => {
    writeFileSync(STORE_PATH, JSON.stringify({
      accounts: {
        telegram: {
          platform: 'telegram',
          status: 'disconnected',
        },
      },
    }));
    const result = await restoreTelegramClient(process.env);
    expect(result).toBeUndefined();
  });

  it('returns undefined when session string is corrupted/invalid', async () => {
    writeFileSync(STORE_PATH, JSON.stringify({
      accounts: {
        telegram: {
          platform: 'telegram',
          status: 'connected',
          sessionString: 'corrupted_encrypted_data',
        },
      },
    }));
    const result = await restoreTelegramClient(process.env);
    expect(result).toBeUndefined();
  });
});
