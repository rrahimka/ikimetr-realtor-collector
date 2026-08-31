import { describe, it, expect } from 'vitest';
import { createDatabase, createRepositories } from '@ikimetr/database';
import { createConnectorRunner } from './connectors.js';
import { runWorkerOnce } from './worker.js';

/** Isolates connector runs from any real connections.json on disk. */
function telegramEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ALLOW_TEST_CONNECTOR: 'true',
    IKIMETR_DATA_DIR: '/tmp/ikimetr-telegram-test-empty',
    ...extra,
  };
}

describe('createConnectorRunner — Telegram routing', () => {
  it('throws telegram_credentials_not_configured when env vars are missing', async () => {
    const env = telegramEnv();
    delete env.TELEGRAM_API_ID;
    delete env.TELEGRAM_API_HASH;
    delete env.TELEGRAM_SESSION_SECRET;
    const runner = createConnectorRunner(env);
    const source = {
      id: 1,
      name: 'Test Telegram Channel',
      type: 'telegram_channel' as const,
      locator: '@test_channel',
      language: 'AZ' as const,
      maxPages: 10,
      maxDepth: 0,
      delayMs: 0,
      enabled: true,
      killSwitch: false,
    };
    await expect(
      runner(source, { shouldStop: () => false }),
    ).rejects.toThrow('telegram_credentials_not_configured');
  });

  it('throws telegram_credentials_not_configured when store has no session', async () => {
    const env = telegramEnv({
      TELEGRAM_API_ID: '12345',
      TELEGRAM_API_HASH: 'test_hash_value',
      TELEGRAM_SESSION_SECRET: 'a'.repeat(64),
    });
    const runner = createConnectorRunner(env);
    const source = {
      id: 1,
      name: 'Test Telegram Group',
      type: 'telegram_group' as const,
      locator: '@test_group',
      language: 'AZ' as const,
      maxPages: 10,
      maxDepth: 0,
      delayMs: 0,
      enabled: true,
      killSwitch: false,
    };
    await expect(
      runner(source, { shouldStop: () => false }),
    ).rejects.toThrow('telegram_credentials_not_configured');
  });
});

describe('Telegram checkpointing', () => {
  function setup() {
    const db = createDatabase(':memory:');
    const repos = createRepositories(db);
    const source = repos.sources.create({
      name: 'Telegram Channel',
      type: 'telegram_channel',
      locator: '@baku_realty',
      language: 'AZ',
      maxPages: 10,
      maxDepth: 0,
      delayMs: 0,
      enabled: true,
      killSwitch: false,
    });
    return { db, repos, source };
  }

  it('advances the checkpoint from the connector-reported message id', async () => {
    const { db, repos, source } = setup();
    repos.runs.enqueue(source.id);

    await runWorkerOnce(repos, () => Promise.resolve({
      pagesChecked: 1,
      estimatedItems: 0,
      items: [],
      checkpointId: '900',
    }));

    expect(repos.checkpoints.get(source.id)).toMatchObject({
      checkpointType: 'telegram_mtproto',
      lastCheckpointId: '900',
    });
    db.close();
  });

  it('never lets the checkpoint move backwards', async () => {
    const { db, repos, source } = setup();
    repos.checkpoints.save(source.id, 'telegram_mtproto', '1000', 0);
    repos.runs.enqueue(source.id);

    await runWorkerOnce(repos, () => Promise.resolve({
      pagesChecked: 1,
      estimatedItems: 0,
      items: [],
      checkpointId: '900',
    }));

    expect(repos.checkpoints.get(source.id)?.lastCheckpointId).toBe('1000');
    db.close();
  });

  it('does not advance the checkpoint when the run fails', async () => {
    const { db, repos, source } = setup();
    repos.runs.enqueue(source.id);

    await runWorkerOnce(repos, () => Promise.reject(new Error('telegram_not_authenticated')));

    expect(repos.checkpoints.get(source.id)).toBeUndefined();
    db.close();
  });

  it('advances the checkpoint even when no evidence matched', async () => {
    const { db, repos, source } = setup();
    repos.runs.enqueue(source.id);

    // Messages with no phone produce zero items; the checkpoint must still move
    // so the same messages are not re-fetched on every tick.
    await runWorkerOnce(repos, () => Promise.resolve({
      pagesChecked: 1,
      estimatedItems: 0,
      items: [],
      checkpointId: '1500',
    }));

    expect(repos.checkpoints.get(source.id)?.lastCheckpointId).toBe('1500');
    db.close();
  });
});

describe('Telegram lead persistence', () => {
  it('persists buyer/seller/realtor_request leads carried on the result', async () => {
    const db = createDatabase(':memory:');
    const repos = createRepositories(db);
    const source = repos.sources.create({
      name: 'Telegram Group',
      type: 'telegram_group',
      locator: '@baku_rent',
      language: 'AZ',
      maxPages: 10,
      maxDepth: 0,
      delayMs: 0,
      enabled: true,
      killSwitch: false,
    });
    repos.runs.enqueue(source.id);

    await runWorkerOnce(repos, () => Promise.resolve({
      pagesChecked: 1,
      estimatedItems: 0,
      items: [],
      leads: [
        {
          leadType: 'buyer' as const,
          sourcePlatform: 'telegram',
          sourceSurface: 'message_text',
          sourceUrl: 'https://t.me/c/12345/101',
          externalId: '101',
          intentExcerpt: 'Kiraye ev axtariram',
          confidence: 0.6,
        },
        {
          leadType: 'seller' as const,
          sourcePlatform: 'telegram',
          sourceSurface: 'message_text',
          sourceUrl: 'https://t.me/c/12345/102',
          externalId: '102',
          intentExcerpt: 'Evimi satiram',
          confidence: 0.7,
        },
      ],
    }));

    expect(repos.leads.list()).toHaveLength(2);
    expect(repos.leads.list().map((l) => l.leadType).sort()).toEqual(['buyer', 'seller']);
    db.close();
  });

  it('persists a realtor_request lead and does not duplicate it on a later tick', async () => {
    const db = createDatabase(':memory:');
    const repos = createRepositories(db);
    const source = repos.sources.create({
      name: 'Telegram Group',
      type: 'telegram_group',
      locator: '@baku_rent',
      language: 'AZ',
      maxPages: 10,
      maxDepth: 0,
      delayMs: 0,
      enabled: true,
      killSwitch: false,
    });

    // The same realtor_request arriving on two consecutive ticks must stay a
    // single lead: repos.leads.create dedupes on platform+username+leadType.
    const realtorRequest = [
      {
        leadType: 'realtor_request' as const,
        sourcePlatform: 'telegram',
        sourceSurface: 'message_text',
        sourceUrl: 'https://t.me/c/12345/103',
        externalId: '103',
        username: 'baku_realtor',
        intentExcerpt: 'Makler lazimdir',
        confidence: 0.65,
      },
    ];

    for (let tick = 0; tick < 2; tick += 1) {
      repos.runs.enqueue(source.id);
      await runWorkerOnce(repos, () => Promise.resolve({
        pagesChecked: 1,
        estimatedItems: 0,
        items: [],
        leads: realtorRequest,
      }));
    }

    const leads = repos.leads.list();
    expect(leads.filter((l) => l.leadType === 'realtor_request')).toHaveLength(1);
    expect(leads[0]?.sourcePlatform).toBe('telegram');
    db.close();
  });
});
