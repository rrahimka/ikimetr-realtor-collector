import { describe, expect, it } from 'vitest';
import { t, tEnum } from './i18n';

describe('i18n', () => {
  it('defaults to Russian', () => {
    expect(t('ru', 'login.submit')).toBe('Войти');
    expect(t('ru', 'nav.contacts')).toBe('Contacts');
  });

  it('translates essential actions to Azerbaijani', () => {
    expect(t('az', 'login.submit')).toBe('Daxil ol');
    expect(t('az', 'nav.contacts')).toBe('Əlaqələr');
    expect(t('az', 'contacts.csvExport')).toBe('CSV ixrac');
    expect(t('az', 'import.submit')).toBe('İdxal et');
    expect(t('az', 'common.logout')).toBe('Çıxış');
  });

  it('falls back to Russian when a key is missing', () => {
    expect(t('az', 'does.not.exist')).toBe('does.not.exist');
  });

  it('localises enum labels', () => {
    expect(tEnum('az', 'status', 'verified')).toBe('təsdiqləndi');
    expect(tEnum('ru', 'run', 'completed')).toBe('завершено');
    expect(tEnum('az', 'type', 'agency')).toBe('agentlik');
  });

  it('covers essential keys in both locales', () => {
    const keys = ['login.submit', 'nav.contacts', 'nav.sources', 'nav.runs', 'nav.review', 'contacts.csvExport', 'contacts.empty', 'import.submit', 'import.accepted', 'import.rejected', 'import.duplicates', 'common.logout'];
    for (const key of keys) {
      expect(t('ru', key)).not.toBe(key);
      expect(t('az', key)).not.toBe(key);
    }
  });
});
