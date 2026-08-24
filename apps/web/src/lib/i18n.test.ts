import { describe, expect, it } from 'vitest';
import { formatDateTime, t, tCsvError, tEnum, tReason } from './i18n';

describe('i18n', () => {
  it('defaults to Russian', () => {
    expect(t('ru', 'login.submit')).toBe('Войти');
    expect(t('ru', 'nav.contacts')).toBe('Контакты');
    expect(t('ru', 'dashboard.title')).toBe('Панель');
    expect(t('ru', 'detail.colPlatform')).toBe('Платформа');
  });

  it('translates essential actions to Azerbaijani', () => {
    expect(t('az', 'login.submit')).toBe('Daxil ol');
    expect(t('az', 'nav.contacts')).toBe('Əlaqələr');
    expect(t('az', 'contacts.csvExport')).toBe('Siyahını ixrac et');
    expect(t('az', 'import.submit')).toBe('İdxal et');
    expect(t('az', 'common.logout')).toBe('Çıxış');
  });

  it('falls back to Russian for an unknown language', () => {
    expect(t('en', 'nav.contacts')).toBe('Контакты');
  });

  it('returns an unknown key unchanged', () => {
    expect(t('az', 'does.not.exist')).toBe('does.not.exist');
  });

  it('localises enum labels', () => {
    expect(tEnum('az', 'status', 'verified')).toBe('təsdiqləndi');
    expect(tEnum('ru', 'run', 'completed')).toBe('завершено');
    expect(tEnum('az', 'type', 'agency')).toBe('agentlik');
  });

  it('localises every classification reason emitted by the classifier', () => {
    expect(tReason('ru', 'professional_keywords')).toBe('Профессиональные ключевые слова');
    expect(tReason('az', 'professional_keywords')).toBe('Peşəkar açar sözlər');
    expect(tReason('ru', 'location_and_transaction')).toBe('Локация и сделка');
    expect(tReason('az', 'location_and_transaction')).toBe('Məkan və əməliyyat');
    expect(tReason('ru', 'phone_repeated_across_listings')).toBe('Номер встречается в нескольких объявлениях');
    expect(tReason('ru', 'real_estate_profile')).toBe('Профиль посвящён недвижимости');
    expect(tReason('ru', 'agency_name')).toBe('Название агентства');
  });

  it('formats timestamps deterministically in the Asia/Baku time zone', () => {
    expect(formatDateTime('ru', '2026-08-24T16:10:08.077Z')).toBe('24.08.2026, 20:10');
    expect(formatDateTime('az', '2026-08-24T16:10:08.077Z')).toBe('24.08.2026, 20:10');
  });

  it('localises known CSV validation errors without changing unknown server errors', () => {
    expect(tCsvError('ru', 'Missing required header: phone')).toBe('Отсутствует обязательный столбец: phone');
    expect(tCsvError('az', 'invalid phone')).toBe('Yanlış telefon nömrəsi');
    expect(tCsvError('ru', 'empty phone')).toBe('Телефонный номер не указан');
    expect(tCsvError('az', 'empty phone')).toBe('Telefon nömrəsi göstərilməyib');
    expect(tCsvError('ru', 'file too large')).toBe('Файл слишком большой');
    expect(tCsvError('az', 'invalid file type')).toBe('Yanlış fayl növü');
    expect(tCsvError('ru', 'unexpected failure')).toBe('unexpected failure');
  });

  it('covers essential keys in both locales', () => {
    const keys = [
      'login.submit', 'nav.dashboard', 'nav.contacts', 'nav.sources', 'nav.keywords', 'nav.runs', 'nav.review',
      'dashboard.title', 'dashboard.eyebrow', 'contacts.title', 'contacts.eyebrow', 'contacts.csvExport',
      'contacts.empty', 'detail.eyebrow', 'detail.evidence', 'detail.colPlatform', 'sources.title',
      'sources.eyebrow', 'sources.kill', 'runs.title', 'runs.eyebrow', 'review.title', 'review.eyebrow',
      'keywords.title', 'import.submit', 'import.downloadTemplate', 'import.templateHint', 'import.accepted',
      'import.rejected', 'import.duplicates', 'common.logout',
    ];
    for (const key of keys) {
      expect(t('ru', key)).not.toBe(key);
      expect(t('az', key)).not.toBe(key);
    }
  });
});
