export type Lang = 'ru' | 'az';

type Entry = { ru: string; az: string };

const dict: Record<string, Entry> = {
  'nav.dashboard': { ru: 'Панель', az: 'İdarəetmə paneli' },
  'nav.sources': { ru: 'Источники', az: 'Mənbələr' },
  'nav.keywords': { ru: 'Ключевые слова', az: 'Açar sözlər' },
  'nav.contacts': { ru: 'Контакты', az: 'Əlaqələr' },
  'nav.runs': { ru: 'Запуски', az: 'İşlər' },
  'nav.review': { ru: 'Проверка', az: 'Yoxlama' },
  'common.logout': { ru: 'Выйти', az: 'Çıxış' },
  'common.search': { ru: 'Поиск', az: 'Axtar' },
  'common.back': { ru: '← Назад к списку', az: '← Siyahıya qayıt' },
  'login.subtitle': { ru: 'LOCAL ACCESS', az: 'LOKAL GİRİŞ' },
  'login.title': { ru: 'Realtor Collector', az: 'Rieltor Kollektor' },
  'login.password': { ru: 'Пароль', az: 'Şifrə' },
  'login.submit': { ru: 'Войти', az: 'Daxil ol' },
  'login.error': { ru: 'Неверный пароль или не настроен env', az: 'Səhv şifrə və ya env qurulmayıb' },
  'dashboard.title': { ru: 'Панель', az: 'İdarəetmə paneli' },
  'dashboard.eyebrow': { ru: 'Обзор', az: 'Ümumi baxış' },
  'dashboard.sources': { ru: 'Источники', az: 'Mənbələr' },
  'dashboard.runs': { ru: 'Запуски', az: 'İşlər' },
  'dashboard.contacts': { ru: 'Уникальные номера', az: 'Unikal nömrələr' },
  'dashboard.new': { ru: 'Новые записи', az: 'Yeni qeydlər' },
  'dashboard.errors': { ru: 'Ошибки', az: 'Xətalar' },
  'dashboard.active': { ru: 'Активные задания', az: 'Aktiv tapşırıqlar' },
  'contacts.eyebrow': { ru: 'Каталог с подтверждениями', az: 'Sübutlarla təsdiqlənmiş kataloq' },
  'contacts.title': { ru: 'Контакты', az: 'Əlaqələr' },
  'contacts.searchPlaceholder': { ru: 'Имя, агентство или номер', az: 'Ad, agentlik və ya nömrə' },
  'contacts.typeAll': { ru: 'Тип: все', az: 'Növ: hamısı' },
  'contacts.statusAll': { ru: 'Статус: все', az: 'Status: hamısı' },
  'contacts.originAll': { ru: 'Происхождение: все', az: 'Mənşə: hamısı' },
  'contacts.originAz': { ru: 'Азербайджан', az: 'Azərbaycan' },
  'contacts.originForeign': { ru: 'Зарубежный', az: 'Xarici' },
  'contacts.csvExport': { ru: 'Экспортировать список', az: 'Siyahını ixrac et' },
  'contacts.colContact': { ru: 'Контакт', az: 'Əlaqə' },
  'contacts.colNumber': { ru: 'Номер', az: 'Nömrə' },
  'contacts.colClass': { ru: 'Класс', az: 'Sinif' },
  'contacts.colPlatform': { ru: 'Платформа', az: 'Platforma' },
  'contacts.colVerification': { ru: 'Проверка', az: 'Yoxlama' },
  'contacts.colFound': { ru: 'Обнаружен', az: 'Tapılıb' },
  'contacts.empty': { ru: 'Ничего не найдено. Измените фильтры или запустите сбор.', az: 'Heç nə tapılmadı. Filtrləri dəyişin və ya toplama işə salın.' },
  'contacts.foreign': { ru: 'зарубежный', az: 'xarici' },
  'detail.eyebrow': { ru: 'Контакт', az: 'Əlaqə' },
  'detail.number': { ru: 'Номер', az: 'Nömrə' },
  'detail.class': { ru: 'Класс', az: 'Sinif' },
  'detail.platform': { ru: 'Платформа', az: 'Platforma' },
  'detail.colPlatform': { ru: 'Платформа', az: 'Platforma' },
  'detail.status': { ru: 'статус', az: 'status' },
  'detail.found': { ru: 'Обнаружен', az: 'Tapılıb' },
  'detail.updated': { ru: 'обновлён', az: 'yeniləndi' },
  'detail.evidence': { ru: 'Подтверждения', az: 'Sübutlar' },
  'detail.evidenceEmpty': { ru: 'Нет подтверждений.', az: 'Sübut qeydləri yoxdur.' },
  'detail.colSource': { ru: 'Источник', az: 'Mənbə' },
  'detail.colType': { ru: 'Тип', az: 'Növ' },
  'detail.colText': { ru: 'Текст', az: 'Mətn' },
  'detail.colDate': { ru: 'Дата', az: 'Tarix' },
  'sources.eyebrow': { ru: 'Параметры сбора', az: 'Toplama parametrləri' },
  'sources.title': { ru: 'Источники', az: 'Mənbələr' },
  'sources.colName': { ru: 'Название', az: 'Ad' },
  'sources.colTypeLang': { ru: 'Тип / язык', az: 'Növ / dil' },
  'sources.colLocator': { ru: 'URL или запрос', az: 'URL və ya sorğu' },
  'sources.colLimits': { ru: 'Лимиты', az: 'Limitlər' },
  'sources.colStatus': { ru: 'Статус', az: 'Status' },
  'sources.colActions': { ru: 'Действия', az: 'Əməliyyatlar' },
  'sources.pages': { ru: 'стр.', az: 'səh.' },
  'sources.depth': { ru: 'глубина', az: 'dərinlik' },
  'sources.killSwitch': { ru: 'Аварийно отключён', az: 'Fövqəladə söndürülüb' },
  'sources.enabled': { ru: 'Включён', az: 'Aktiv' },
  'sources.disabled': { ru: 'Выключен', az: 'Deaktiv' },
  'sources.run': { ru: 'Запустить', az: 'İşə sal' },
  'sources.kill': { ru: 'Аварийное отключение', az: 'Təcili dayandırma' },
  'sources.killOn': { ru: 'Включить', az: 'Aktiv et' },
  'sourceForm.title': { ru: 'Добавить источник', az: 'Mənbə əlavə et' },
  'sourceForm.name': { ru: 'Название', az: 'Ad' },
  'sourceForm.type': { ru: 'Тип', az: 'Növ' },
  'sourceForm.locator': { ru: 'URL или запрос', az: 'URL və ya sorğu' },
  'sourceForm.language': { ru: 'Язык', az: 'Dil' },
  'sourceForm.pages': { ru: 'Страниц', az: 'Səhifə' },
  'sourceForm.depth': { ru: 'Глубина', az: 'Dərinlik' },
  'sourceForm.delay': { ru: 'Задержка, мс', az: 'Gecikmə, ms' },
  'sourceForm.add': { ru: 'Добавить', az: 'Əlavə et' },
  'sourceForm.saving': { ru: 'Сохранение…', az: 'Saxlanılır…' },
  'runs.eyebrow': { ru: 'История очереди', az: 'Növbə tarixçəsi' },
  'runs.title': { ru: 'Запуски', az: 'İşlər' },
  'runs.colSource': { ru: 'Источник', az: 'Mənbə' },
  'runs.colStatus': { ru: 'Статус', az: 'Status' },
  'runs.colTimes': { ru: 'Начало / завершение', az: 'Başlanğıc / bitmə' },
  'runs.colPages': { ru: 'Страницы', az: 'Səhifələr' },
  'runs.colFound': { ru: 'Найдено / уникально', az: 'Tapılıb / unikal' },
  'runs.colError': { ru: 'Ошибка', az: 'Xəta' },
  'runs.review': { ru: 'проверка', az: 'yoxlama' },
  'runs.stop': { ru: 'Остановить', az: 'Dayandır' },
  'review.eyebrow': { ru: 'Ручная проверка', az: 'Əl ilə yoxlama' },
  'review.title': { ru: 'Проверка', az: 'Yoxlama' },
  'review.doubtful': { ru: 'Сомнительные и непроверенные', az: 'Şübhəli və yoxlanılmamış' },
  'review.colContact': { ru: 'Контакт', az: 'Əlaqə' },
  'review.colNumber': { ru: 'Номер', az: 'Nömrə' },
  'review.colReasons': { ru: 'Причины', az: 'Səbəblər' },
  'review.colActions': { ru: 'Действия', az: 'Əməliyyatlar' },
  'review.unknown': { ru: 'Неизвестно', az: 'Naməlum' },
  'review.noSignals': { ru: 'Недостаточно сигналов', az: 'Kifayət qədər siqnal yoxdur' },
  'review.verify': { ru: 'Подтвердить риелтора', az: 'Rieltoru təsdiqlə' },
  'review.reject': { ru: 'Отклонить', az: 'Rədd et' },
  'review.mergeHistory': { ru: 'История объединений', az: 'Birləşdirmə tarixçəsi' },
  'review.noMerges': { ru: 'Объединений пока нет. API ручного merge доступен по /api/review/merge.', az: 'Hələ birləşdirmə yoxdur. Manual merge API /api/review/merge ünvanındadır.' },
  'review.undo': { ru: 'Отменить объединение', az: 'Birləşdirməni geri al' },
  'keywords.title': { ru: 'Ключевые слова', az: 'Açar sözlər' },
  'keywordForm.placeholder': { ru: 'Ключевое слово или #хештег', az: 'Açar söz və ya #heşteq' },
  'keywordForm.add': { ru: 'Добавить', az: 'Əlavə et' },
  'import.title': { ru: 'Импорт CSV контактов', az: 'Kontakt CSV idxalı' },
  'import.file': { ru: 'CSV-файл', az: 'CSV faylı' },
  'import.submit': { ru: 'Импортировать', az: 'İdxal et' },
  'import.downloadTemplate': { ru: 'Скачать шаблон импорта', az: 'İdxal şablonunu yüklə' },
  'import.templateHint': { ru: 'Для импорта используйте template.csv', az: 'İdxal üçün template.csv faylından istifadə edin' },
  'import.result': { ru: 'Итог', az: 'Nəticə' },
  'import.total': { ru: 'Всего строк', az: 'Ümumi sətir' },
  'import.accepted': { ru: 'Принято', az: 'Qəbul edildi' },
  'import.rejected': { ru: 'Отклонено', az: 'Rədd edildi' },
  'import.duplicates': { ru: 'Дубликаты', az: 'Dublikatlar' },
  'status.unreviewed': { ru: 'не проверено', az: 'yoxlanılmamış' },
  'status.verified': { ru: 'подтверждено', az: 'təsdiqləndi' },
  'status.rejected': { ru: 'отклонено', az: 'rədd edildi' },
  'run.queued': { ru: 'в очереди', az: 'növbədə' },
  'run.running': { ru: 'выполняется', az: 'icra olunur' },
  'run.completed': { ru: 'завершено', az: 'tamamlandı' },
  'run.failed': { ru: 'ошибка', az: 'uğursuz' },
  'run.cancelled': { ru: 'отменено', az: 'ləğv edildi' },
  'type.agent': { ru: 'риелтор', az: 'rieltor' },
  'type.agency': { ru: 'агентство', az: 'agentlik' },
  'type.owner': { ru: 'собственник', az: 'sahib' },
  'type.unknown': { ru: 'неизвестно', az: 'naməlum' },
  'type.suspicious': { ru: 'подозрительно', az: 'şübhəli' },
  'reason.professional_keywords': { ru: 'Профессиональные ключевые слова', az: 'Peşəkar açar sözlər' },
  'reason.location_and_transaction': { ru: 'Локация и сделка', az: 'Məkan və əməliyyat' },
  'reason.phone_repeated_across_listings': { ru: 'Номер встречается в нескольких объявлениях', az: 'Nömrə bir neçə elanda təkrarlanır' },
  'reason.real_estate_profile': { ru: 'Профиль посвящён недвижимости', az: 'Daşınmaz əmlak profili' },
  'reason.agency_name': { ru: 'Название агентства', az: 'Agentlik adı' },
  'csvError.missingPhoneHeader': { ru: 'Отсутствует обязательный столбец: phone', az: 'Məcburi phone sütunu yoxdur' },
  'csvError.invalidPhone': { ru: 'Неверный телефонный номер', az: 'Yanlış telefon nömrəsi' },
  'csvError.emptyPhone': { ru: 'Телефонный номер не указан', az: 'Telefon nömrəsi göstərilməyib' },
  'csvError.fileTooLarge': { ru: 'Файл слишком большой', az: 'Fayl çox böyükdür' },
  'csvError.invalidFileType': { ru: 'Недопустимый тип файла', az: 'Yanlış fayl növü' },
  'csvError.fileRequired': { ru: 'Выберите CSV-файл', az: 'CSV faylı seçin' },
  'csvError.requestFailed': { ru: 'Не удалось выполнить запрос', az: 'Sorğunu yerinə yetirmək mümkün olmadı' },
};

export function t(lang: string, key: string, vars?: Record<string, string | number>): string {
  const entry = dict[key];
  let s = entry ? entry[lang === 'az' ? 'az' : 'ru'] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function tEnum(lang: Lang, prefix: 'status' | 'run' | 'type', value: string): string {
  return t(lang, `${prefix}.${value}`);
}

export function tReason(lang: Lang, reason: string): string {
  const key = `reason.${reason}`;
  const translated = t(lang, key);
  return translated === key ? reason : translated;
}

export function tCsvError(lang: Lang, message: string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes('missing required header') && normalized.includes('phone')) return t(lang, 'csvError.missingPhoneHeader');
  if (normalized === 'invalid phone') return t(lang, 'csvError.invalidPhone');
  if (normalized === 'empty phone') return t(lang, 'csvError.emptyPhone');
  if (normalized === 'file too large' || normalized.includes('must be under 5 mb')) return t(lang, 'csvError.fileTooLarge');
  if (normalized === 'invalid file type') return t(lang, 'csvError.invalidFileType');
  if (normalized.includes('csv file is required')) return t(lang, 'csvError.fileRequired');
  if (normalized === 'request failed') return t(lang, 'csvError.requestFailed');
  return message;
}

export function formatDateTime(lang: Lang, value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat(lang === 'az' ? 'az-AZ' : 'ru-RU', {
    timeZone: 'Asia/Baku',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${valueFor('day')}.${valueFor('month')}.${valueFor('year')}, ${valueFor('hour')}:${valueFor('minute')}`;
}
