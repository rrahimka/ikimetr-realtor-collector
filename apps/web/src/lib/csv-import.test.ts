import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import { importContactsCsv } from './csv-import';

let db: CollectorDatabase | undefined;
afterEach(() => db?.close());

function setup() {
  db = createDatabase(':memory:');
  return createRepositories(db);
}

const HEADER = 'phone,name,agency,username,platform,source_url,location_type,excerpt';

describe('contacts CSV import', () => {
  it('imports valid rows and reports accepted', () => {
    const repos = setup();
    const report = importContactsCsv(repos, `${HEADER}\n050 123 45 67,Aysel Məmmədova,Bakı Emlak,,website,https://fixture.invalid/1,listing,"Mənzil satışı"\n`, 'test');
    expect(report).toMatchObject({ total: 1, accepted: 1, rejected: 0, duplicates: 0 });
    expect(repos.contacts.byPhone('+994501234567')).toBeTruthy();
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(1);
  });

  it('rejects invalid phone and empty rows without breaking the import', () => {
    const repos = setup();
    const report = importContactsCsv(repos, `${HEADER}\n123,Invalid,,,\n,Empty,,,\n050 123 45 67,Valid,,,\n`, 'test');
    expect(report.total).toBe(3);
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(2);
    expect(report.errors.map((e) => e.reason)).toContain('invalid phone');
  });

  it('counts duplicates and stays idempotent on repeated import', () => {
    const repos = setup();
    const csv = `${HEADER}\n050 123 45 67,First,,,\n`;
    const first = importContactsCsv(repos, csv, 'a');
    const second = importContactsCsv(repos, csv, 'b');
    expect(first.accepted).toBe(1);
    expect(second).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(repos.contacts.list()).toHaveLength(1);
  });

  it('requires the phone header', () => {
    const repos = setup();
    expect(() => importContactsCsv(repos, 'name,agency\nA,B\n', 'test')).toThrow('phone');
  });
});
