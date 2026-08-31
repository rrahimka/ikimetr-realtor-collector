import { describe, expect, it } from 'vitest';
import { formatDateTime, t, tCsvError, tEnum, tReason } from './i18n';

describe('i18n', () => {
  it('defaults to Russian', () => {
    expect(t('ru', 'login.submit')).toBe('Войти');
    expect(t('ru', 'nav.contacts')).toBe('Риелторы');
    expect(t('ru', 'dashboard.title')).toBe('Панель');
    expect(t('ru', 'detail.colPlatform')).toBe('Платформа');
  });

  it('translates essential actions to Azerbaijani and English', () => {
    expect(t('az', 'login.submit')).toBe('Daxil ol');
    expect(t('az', 'nav.contacts')).toBe('Rieltorlar');
    expect(t('az', 'contacts.csvExport')).toBe('Siyahını ixrac et');
    expect(t('az', 'import.submit')).toBe('İdxal et');
    expect(t('az', 'common.logout')).toBe('Çıxış');

    expect(t('en', 'login.submit')).toBe('Sign in');
    expect(t('en', 'nav.contacts')).toBe('Realtors');
    expect(t('en', 'contacts.csvExport')).toBe('Export list');
    expect(t('en', 'common.logout')).toBe('Logout');
  });

  it('supports non-secret memory hint across all locales', () => {
    expect(t('ru', 'login.hintText')).toBe('1-ч-7-G-U-F');
    expect(t('az', 'login.hintText')).toBe('1-ч-7-G-U-F');
    expect(t('en', 'login.hintText')).toBe('1-ч-7-G-U-F');
  });

  it('returns an unknown key unchanged', () => {
    expect(t('az', 'does.not.exist')).toBe('does.not.exist');
  });

  it('localises enum labels', () => {
    expect(tEnum('az', 'status', 'verified')).toBe('təsdiqləndi');
    expect(tEnum('ru', 'run', 'completed')).toBe('завершено');
    expect(tEnum('en', 'run', 'completed')).toBe('completed');
    expect(tEnum('az', 'type', 'agency')).toBe('agentlik');
    expect(tEnum('ru', 'run', 'blocked')).toBe('заблокировано');
    expect(tEnum('az', 'run', 'blocked')).toBe('bloklandı');
  });

  it('localises Bina automation and outcome labels in both languages', () => {
    expect(t('ru', 'sourceType.binaAgency')).toBe('Bina.az — агентства');
    expect(t('az', 'sourceType.binaAgency')).toBe('Bina.az — agentliklər');
    expect(t('ru', 'bina.automatic')).toBe('Автоматический сбор');
    expect(t('az', 'bina.interval', { hours: 6 })).toBe('Hər 6 saatdan bir');
    expect(t('ru', 'bina.interval', { hours: 12 })).toBe('Каждые 12 часов');
    for (const key of ['bina.lastRun', 'bina.nextRun', 'bina.pagesChecked', 'bina.agenciesFound', 'bina.newContacts', 'bina.duplicates', 'bina.privateSkipped', 'bina.stopReason']) {
      expect(t('ru', key)).not.toBe(key);
      expect(t('az', key)).not.toBe(key);
    }
  });

  it('localises social connection and WhatsApp labels', () => {
    expect(t('ru', 'connections.title')).toBe('Подключения и социальные сети');
    expect(t('az', 'connections.title')).toBe('Qoşulmalar və sosial şəbəkələr');
    expect(t('en', 'connections.title')).toBe('Connections & Social Networks');

    expect(t('ru', 'connections.statusConnected')).toBe('✓ Подключено');
    expect(t('az', 'connections.statusConnected')).toBe('✓ Qoşulub');
    expect(t('en', 'connections.statusConnected')).toBe('✓ Connected');

    expect(t('ru', 'whatsapp.title')).toBe('WhatsApp группы');
    expect(t('az', 'whatsapp.title')).toBe('WhatsApp qrupları');
    expect(t('en', 'whatsapp.title')).toBe('WhatsApp Groups');
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
      'sourceType.binaAgency', 'bina.automatic', 'bina.interval', 'bina.lastRun', 'bina.nextRun',
      'bina.pagesChecked', 'bina.agenciesFound', 'bina.newContacts', 'bina.duplicates',
      'bina.privateSkipped', 'bina.stopReason',
    ];
    for (const key of keys) {
      expect(t('ru', key)).not.toBe(key);
      expect(t('az', key)).not.toBe(key);
    }
  });

  it('localises new source types, operational statuses, and button states in both locales', () => {
    expect(t('ru', 'sourceType.tapAz')).toBe('Tap.az — недвижимость');
    expect(t('az', 'sourceType.tapAz')).toBe('Tap.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.arendaAz')).toBe('Arenda.az — аренда и продажа');
    expect(t('az', 'sourceType.arendaAz')).toBe('Arenda.az — kirayə və satış');
    expect(t('ru', 'sourceType.yeniemlakAz')).toBe('YeniEmlak.az — недвижимость');
    expect(t('az', 'sourceType.yeniemlakAz')).toBe('YeniEmlak.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.emlakbazariAz')).toBe('EmlakBazari.az — недвижимость');
    expect(t('az', 'sourceType.emlakbazariAz')).toBe('EmlakBazari.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.ipotekaAz')).toBe('Ipoteka.az — недвижимость');
    expect(t('az', 'sourceType.ipotekaAz')).toBe('Ipoteka.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.cityAz')).toBe('City.az — недвижимость');
    expect(t('az', 'sourceType.cityAz')).toBe('City.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.vipemlakAz')).toBe('VIPemlak.az — недвижимость');
    expect(t('az', 'sourceType.vipemlakAz')).toBe('VIPemlak.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.ev10Az')).toBe('Ev10.az — недвижимость');
    expect(t('az', 'sourceType.ev10Az')).toBe('Ev10.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.lalafoAz')).toBe('Lalafo.az — недвижимость');
    expect(t('az', 'sourceType.lalafoAz')).toBe('Lalafo.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.unvanAz')).toBe('Unvan.az — недвижимость');
    expect(t('az', 'sourceType.unvanAz')).toBe('Unvan.az — daşınmaz əmlak');
    expect(t('ru', 'sourceType.stopAz')).toBe('Stop.az — недвижимость');
    expect(t('az', 'sourceType.stopAz')).toBe('Stop.az — daşınmaz əmlak');

    expect(t('ru', 'sourceStatus.working')).toBe('✓ Работает');
    expect(t('az', 'sourceStatus.working')).toBe('✓ İşləyir');
    expect(t('ru', 'button.running')).toBe('Запускается…');
    expect(t('az', 'button.running')).toBe('İşə salınır…');
    expect(t('ru', 'button.alreadyRunning')).toBe('Уже выполняется');
    expect(t('az', 'button.alreadyRunning')).toBe('Artıq icra olunur');
    expect(t('ru', 'toast.runCreated')).toBe('Запуск успешно создан');
    expect(t('az', 'toast.runCreated')).toBe('İş uğurla yaradıldı');
  });
});
