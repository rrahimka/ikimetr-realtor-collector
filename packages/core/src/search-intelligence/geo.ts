import { toLatinAscii } from './transliteration';

export interface GeoLocationEntry {
  canonical: string;
  type: 'country' | 'capital' | 'district' | 'metro' | 'city';
  aliases: string[];
}

export const AZERBAIJAN_GEO_DICTIONARY: GeoLocationEntry[] = [
  // Country
  {
    canonical: 'Azərbaycan',
    type: 'country',
    aliases: ['Azərbaycan', 'Azerbaycan', 'Azerbaijan', 'AZ', 'Азербайджан'],
  },
  // Capital
  {
    canonical: 'Bakı',
    type: 'capital',
    aliases: ['Bakı', 'Baku', 'Bakı şəhəri', 'Baku City', 'Баку'],
  },

  // 12 Baku Districts
  { canonical: 'Nərimanov', type: 'district', aliases: ['Nərimanov', 'Narimanov', 'Нариманов', 'Nərimanov r.', 'Narimanov ray'] },
  { canonical: 'Nəsimi', type: 'district', aliases: ['Nəsimi', 'Nasimi', 'Насими', 'Nəsimi r.', 'Nasimi ray'] },
  { canonical: 'Yasamal', type: 'district', aliases: ['Yasamal', 'Ясамал', 'Yasamal r.', 'Yasamal ray'] },
  { canonical: 'Xətai', type: 'district', aliases: ['Xətai', 'Khatai', 'Xetai', 'Хатаи', 'Xətai r.'] },
  { canonical: 'Nizami', type: 'district', aliases: ['Nizami', 'Низами', 'Nizami r.'] },
  { canonical: 'Binəqədi', type: 'district', aliases: ['Binəqədi', 'Binagadi', 'Binaqadi', 'Бинагади', 'Binəqədi r.'] },
  { canonical: 'Sabunçu', type: 'district', aliases: ['Sabunçu', 'Sabunchu', 'Sabuncu', 'Сабунчи', 'Sabunçu r.'] },
  { canonical: 'Suraxanı', type: 'district', aliases: ['Suraxanı', 'Surakhani', 'Suraxani', 'Сураханы', 'Suraxanı r.'] },
  { canonical: 'Səbail', type: 'district', aliases: ['Səbail', 'Sabail', 'Sebail', 'Сабаил', 'Səbail r.'] },
  { canonical: 'Xəzər', type: 'district', aliases: ['Xəzər', 'Khazar', 'Xezer', 'Хазар', 'Xəzər r.'] },
  { canonical: 'Qaradağ', type: 'district', aliases: ['Qaradağ', 'Garadagh', 'Qaradag', 'Гарадаг', 'Qaradağ r.'] },
  { canonical: 'Pirallahı', type: 'district', aliases: ['Pirallahı', 'Pirallahi', 'Пираллахи', 'Pirallahı r.'] },

  // Baku Metro / Key Hubs
  { canonical: '28 May', type: 'metro', aliases: ['28 May', '28 may m.', '28 may metrosu'] },
  { canonical: 'Gənclik', type: 'metro', aliases: ['Gənclik', 'Genclik', 'Gənclik m.', 'Genclik metrosu', 'Гянджлик'] },
  { canonical: 'Nəriman Nərimanov', type: 'metro', aliases: ['Nəriman Nərimanov', 'Nariman Narimanov', 'N.Narimanov m.'] },
  { canonical: 'Elmlər Akademiyası', type: 'metro', aliases: ['Elmlər Akademiyası', 'Elmler Akademiyasi', 'Elmler m.', 'Elmlər m.'] },
  { canonical: 'İnşaatçılar', type: 'metro', aliases: ['İnşaatçılar', 'Insaatcilar', 'Insaatcilar m.'] },
  { canonical: '20 Yanvar', type: 'metro', aliases: ['20 Yanvar', '20 yanvar m.'] },
  { canonical: 'Memar Əcəmi', type: 'metro', aliases: ['Memar Əcəmi', 'Memar Ecemi', 'Ecemi m.'] },
  { canonical: 'Neftçilər', type: 'metro', aliases: ['Neftçilər', 'Neftciler', 'Neftciler m.', 'Нефтчиляр'] },
  { canonical: 'Xalqlar Dostluğu', type: 'metro', aliases: ['Xalqlar Dostluğu', 'Xalqlar Dostlugu', 'Xalqlar m.'] },
  { canonical: 'Əhmədli', type: 'metro', aliases: ['Əhmədli', 'Ahmedli', 'Ehmedli', 'Ehmedli m.', 'Ахмедлы'] },
  { canonical: 'Həzi Aslanov', type: 'metro', aliases: ['Həzi Aslanov', 'Hezi Aslanov', 'Hezi Aslanov m.'] },
  { canonical: 'Koroğlu', type: 'metro', aliases: ['Koroğlu', 'Koroglu', 'Koroglu m.'] },

  // Major Cities & Regions
  { canonical: 'Sumqayıt', type: 'city', aliases: ['Sumqayıt', 'Sumgayit', 'Sumqayit', 'Сумгаит'] },
  { canonical: 'Xırdalan', type: 'city', aliases: ['Xırdalan', 'Khirdalan', 'Xirdalan', 'Хырдалан'] },
  { canonical: 'Gəncə', type: 'city', aliases: ['Gəncə', 'Ganja', 'Gence', 'Гянджа'] },
  { canonical: 'Qəbələ', type: 'city', aliases: ['Qəbələ', 'Gabala', 'Qebele', 'Габала'] },
  { canonical: 'Şəki', type: 'city', aliases: ['Şəki', 'Sheki', 'Seki', 'Шеки'] },
  { canonical: 'Mingəçevir', type: 'city', aliases: ['Mingəçevir', 'Mingachevir', 'Mingecevir', 'Мингечевир'] },
  { canonical: 'Lənkəran', type: 'city', aliases: ['Lənkəran', 'Lankaran', 'Lenkeran', 'Ленкорань'] },
  { canonical: 'Quba', type: 'city', aliases: ['Quba', 'Guba', 'Губа'] },
  { canonical: 'Qusar', type: 'city', aliases: ['Qusar', 'Gusar', 'Гусар'] },
  { canonical: 'Şamaxı', type: 'city', aliases: ['Şamaxı', 'Shamakhi', 'Samaxi', 'Шамаха'] },
  { canonical: 'Bərdə', type: 'city', aliases: ['Bərdə', 'Barda', 'Berde', 'Барда'] },
  { canonical: 'Şəmkir', type: 'city', aliases: ['Şəmkir', 'Shamkir', 'Semkir', 'Шамкир'] },
  { canonical: 'Şirvan', type: 'city', aliases: ['Şirvan', 'Shirvan', 'Sirvan', 'Ширван'] },
  { canonical: 'Salyan', type: 'city', aliases: ['Salyan', 'Сальян'] },
  { canonical: 'Saatlı', type: 'city', aliases: ['Saatlı', 'Saatli', 'Саатлы'] },
  { canonical: 'Sabirabad', type: 'city', aliases: ['Sabirabad', 'Сабирабад'] },
  { canonical: 'Masallı', type: 'city', aliases: ['Masallı', 'Masalli', 'Масаллы'] },
  { canonical: 'Naftalan', type: 'city', aliases: ['Naftalan', 'Нафталан'] },
  { canonical: 'Zaqatala', type: 'city', aliases: ['Zaqatala', 'Zagatala', 'Загатала'] },
  { canonical: 'Qax', type: 'city', aliases: ['Qax', 'Gakh', 'Гах'] },
];

/**
 * Checks if a given string contains any recognized Azerbaijan geographical location.
 */
export function containsAzerbaijanGeo(text: string): boolean {
  const normalizedText = ` ${toLatinAscii(text.toLowerCase()).replace(/[^a-z0-9]/g, ' ')} `;
  for (const entry of AZERBAIJAN_GEO_DICTIONARY) {
    for (const alias of entry.aliases) {
      const normalizedAlias = ` ${toLatinAscii(alias.toLowerCase()).replace(/[^a-z0-9]/g, ' ')} `;
      if (normalizedText.includes(normalizedAlias)) {
        return true;
      }
    }
  }
  return false;
}
