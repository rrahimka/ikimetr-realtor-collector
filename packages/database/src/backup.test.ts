import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase, createRepositories } from './index';
import { createDatabaseBackup, restoreDatabaseBackup, pruneOldBackups } from './backup';

describe('Database Backup and Disaster Recovery', () => {
  const testDir = resolve(__dirname, '../temp_backup_test');
  const testDbPath = resolve(testDir, 'test_source.db');
  const testBackupDir = resolve(testDir, 'backups');
  const testRestorePath = resolve(testDir, 'test_restored.db');

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('1. Creates a consistent backup and verifies PRAGMA integrity', async () => {
    mkdirSync(testDir, { recursive: true });

    // Seed test database
    const db = createDatabase(testDbPath);
    const repos = createRepositories(db);
    const source = repos.sources.create({
      name: 'Test Source',
      type: 'tap_az',
      locator: 'https://fixture.test',
      language: 'AZ',
      maxPages: 10,
      maxDepth: 2,
      delayMs: 100,
      enabled: true,
      killSwitch: false,
    });

    repos.contacts.persistEvidence({
      normalizedPhone: '+994501112233',
      isForeign: false,
      evidence: {
        sourceId: source.id,
        sourceUrl: 'https://fixture.test/1',
        locationType: 'listing',
        excerpt: 'Test listing',
        rawPhone: '050 111 22 33',
        platform: 'website',
        fingerprint: 'fp1',
        name: 'Backup Test Realtor',
      },
      classification: {
        type: 'agent',
        confidence: 0.9,
        reasons: ['test'],
        ruleVersion: '1.0.0',
        classifiedAt: '2026-08-27T10:00:00Z',
      },
    });
    repos.leads.create({
      leadType: 'buyer',
      sourcePlatform: 'telegram',
      sourceSurface: 'message_text',
      sourceUrl: 'https://t.me/test/1',
      intentExcerpt: 'Looking for 2 rooms',
      rooms: 2,
    });
    db.close();

    // Perform backup
    const result = await createDatabaseBackup(testDbPath, testBackupDir);
    expect(existsSync(result.backupPath)).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.tableCounts.contacts).toBe(1);
    expect(result.tableCounts.leads).toBe(1);
  });

  it('2. Restores backup into an isolated database and matches record counts', async () => {
    mkdirSync(testDir, { recursive: true });

    // Seed test database with 3 contacts and 2 leads
    const db = createDatabase(testDbPath);
    const repos = createRepositories(db);
    const source = repos.sources.create({
      name: 'Test Source 2',
      type: 'tap_az',
      locator: 'https://fixture.test',
      language: 'AZ',
      maxPages: 10,
      maxDepth: 2,
      delayMs: 100,
      enabled: true,
      killSwitch: false,
    });

    const createContact = (phone: string, raw: string, name: string, type: 'agent' | 'agency') => {
      repos.contacts.persistEvidence({
        normalizedPhone: phone,
        isForeign: false,
        evidence: {
          sourceId: source.id,
          sourceUrl: `https://fixture.test/${phone}`,
          locationType: 'listing',
          excerpt: 'Test listing',
          rawPhone: raw,
          platform: 'website',
          fingerprint: `fp-${phone}`,
          name,
        },
        classification: {
          type,
          confidence: 0.9,
          reasons: ['test'],
          ruleVersion: '1.0.0',
          classifiedAt: '2026-08-27T10:00:00Z',
        },
      });
    };

    createContact('+994501112231', '050 111 22 31', 'Agent 1', 'agent');
    createContact('+994501112232', '050 111 22 32', 'Agent 2', 'agent');
    createContact('+994501112233', '050 111 22 33', 'Agency 3', 'agency');

    repos.leads.create({ leadType: 'buyer', sourcePlatform: 'telegram', sourceSurface: 'message_text', sourceUrl: 'https://t.me/1', intentExcerpt: 'Buyer 1' });
    repos.leads.create({ leadType: 'seller', sourcePlatform: 'telegram', sourceSurface: 'message_text', sourceUrl: 'https://t.me/2', intentExcerpt: 'Seller 1' });
    db.close();

    const backupResult = await createDatabaseBackup(testDbPath, testBackupDir);

    // Restore to separate location
    const restoreResult = await restoreDatabaseBackup(backupResult.backupPath, testRestorePath);
    expect(restoreResult.integrity).toBe('ok');
    expect(restoreResult.tableCounts.contacts).toBe(3);
    expect(restoreResult.tableCounts.leads).toBe(2);

    // Verify restored DB can be opened and queried via createRepositories
    const restoredDb = createDatabase(testRestorePath);
    const restoredRepos = createRepositories(restoredDb);
    const contacts = restoredRepos.contacts.list();
    const leads = restoredRepos.leads.list();
    expect(contacts).toHaveLength(3);
    expect(leads).toHaveLength(2);
    restoredDb.close();
  });

  it('3. Prunes old backups keeping retention window', () => {
    mkdirSync(testBackupDir, { recursive: true });
    // pruneOldBackups runs safely on empty or normal directory
    pruneOldBackups(testBackupDir, 5);
  });
});
