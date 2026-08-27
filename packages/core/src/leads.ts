import { extractPhones } from './phones';
import { isForeignRealEstatePhone } from './search-intelligence/phones';
import { toLatinAscii } from './search-intelligence/transliteration';
import { AZERBAIJAN_GEO_DICTIONARY } from './search-intelligence/geo';
import type { LeadType, ConfidenceLevel } from './contracts';

export interface LeadClassificationResult {
  isLead: boolean;
  leadType: LeadType;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  signals: string[];
  isRealtorSender: boolean;
  city?: string | undefined;
  district?: string | undefined;
  metro?: string | undefined;
  propertyType?: string | undefined;
  rooms?: number | undefined;
  budgetMin?: number | undefined;
  budgetMax?: number | undefined;
  currency: string;
  intentExcerpt: string;
  isForeign: boolean;
}

const BUYER_PATTERNS = [
  // AZ
  /menzil\s+axtar/i, /ev\s+axtar/i, /almaq\s+istey/i, /ev\s+almaq/i, /menzil\s+almaq/i,
  /kim\s+satir/i, /menzil\s+lazim/i, /ev\s+lazim/i, /baxmaq\s+istey/i, /aliram/i,
  /almaq\s+ucun/i, /satinalma/i,
  // RU
  /ищу\s+.*(?:квартир|дом|новостройк|жиль|недвижим|комнат)/i,
  /куплю\s+.*(?:квартир|дом|жиль|комнат)/i,
  /хочу\s+купить/i, /нужна\s+квартира/i, /нужен\s+дом/i, /ищу\s+недвижимость/i,
  /покупка\s+квартиры/i, /хотим\s+купить/i, /куплю/i,
  // EN
  /looking\s+for\s+.*(?:apartment|house|flat|property|home)/i,
  /want\s+to\s+buy/i, /need\s+.*(?:apartment|house|flat)/i,
  /property\s+wanted/i, /buying\s+apartment/i
];

const SELLER_PATTERNS = [
  // AZ
  /satiram/i, /ev\s+satir/i, /menzil\s+satir/i, /oz\s+evimi\s+sat/i, /oz\s+evim/i,
  /mulkiyyetci/i, /sahibiyem/i, /sahibinden/i, /maklersiz/i, /vasitecisiz/i,
  /maklerler\s+narahat/i, /vasiteciler\s+narahat/i, /birbasa\s+sahibinden/i,
  // RU
  /продаю\s+.*(?:квартир|дом|жиль|комнат)/i,
  /продам\s+.*(?:квартир|дом|жиль|комнат)/i,
  /хочу\s+продать/i, /собственник/i, /от\s+хозяина/i, /без\s+посредников/i,
  /риелторы\s+не\s+беспокоить/i, /риэлторы\s+не\s+беспокоить/i,
  /продается\s+от\s+собственника/i, /продам/i, /продаю/i,
  // EN
  /want\s+to\s+sell/i, /selling\s+my/i, /owner\s+selling/i,
  /direct\s+from\s+owner/i, /for\s+sale\s+by\s+owner/i
];

const RENTER_PATTERNS = [
  // AZ
  /kiraye\s+axtar/i, /kiraye\s+ev\s+axtar/i, /kiraye\s+menzil\s+axtar/i,
  /kiraye\s+lazim/i, /kiraye\s+tut/i, /kiraye\s+gotur/i, /kiraye\s+istey/i,
  /icare\s+axtar/i, /ayliq\s+kiraye\s+axtar/i,
  // RU
  /сниму\s+.*(?:квартир|дом|жиль|комнат)/i,
  /ищу\s+.*(?:в\s+аренду|аренду)/i,
  /нужна\s+квартира\s+в\s+аренду/i, /хочу\s+снять/i,
  /сниму\s+на\s+длительный\s+срок/i, /аренда\s+квартиры/i, /сниму/i,
  // EN
  /looking\s+to\s+rent/i, /need\s+rental/i, /looking\s+for\s+rent/i,
  /want\s+to\s+rent/i, /apartment\s+for\s+rent\s+wanted/i
];

const LANDLORD_PATTERNS = [
  // AZ
  /kiraye\s+ver/i, /icareye\s+ver/i, /ev\s+kiraye\s+ver/i, /menzil\s+kiraye\s+ver/i,
  /oz\s+menzilimi\s+kiraye/i, /oz\s+evimi\s+kiraye/i,
  // RU
  /сдам\s+.*(?:квартир|дом|жиль|комнат)/i,
  /сдаю\s+.*(?:квартир|дом|жиль|комнат)/i,
  /собственник\s+сда/i, /сдаю\s+в\s+аренду/i, /сдам\s+в\s+аренду/i,
  // EN
  /for\s+rent/i, /apartment\s+for\s+lease/i, /renting\s+out/i
];

const INVESTOR_PATTERNS = [
  // AZ
  /investisiya\s+ucun/i, /investisiya\s+etmek/i, /gelirli\s+obyekt/i,
  // RU
  /для\s+инвестиций/i, /инвестиции\s+в\s+недвижимость/i, /инвестиционный\s+объект/i,
  // EN
  /investment\s+property/i, /looking\s+to\s+invest/i, /invest\s+in\s+real\s+estate/i
];

const REALTOR_REQUEST_PATTERNS = [
  // AZ
  /musteri(?:miz|m|ye)?\s+ucun/i, /real\s+musteri/i, /musterim\s+var/i, /musteri(?:miz|m|ye)?\s+.*axtar/i,
  // RU
  /для\s+(?:своего\s+)?клиента/i, /клиент(?:у|ам|а)?\s+(?:нужн|ищет|подбираем)/i,
  /ищу\s+под\s+клиента/i, /есть\s+клиент\s+на/i, /под\s+клиента/i,
  // EN
  /for\s+client/i, /looking\s+for\s+client/i, /client\s+looking/i
];

const QUESTION_PATTERNS = [
  // AZ
  /qiymeti\s+ne\s+qeder/i, /neceyedir/i, /ipoteka\s+var/i, /kredit\s+mumkun/i,
  /kupca\s+var/i, /hansi\s+mertebe/i, /hansi\s+rayon/i, /baxmaq\s+olar/i,
  // RU
  /сколько\s+стоит/i, /цена\s*\?/i, /торг\s+есть/i, /ипотека\s+есть/i, /купчая\s+есть/i,
  /можно\s+посмотреть/i, /какой\s+район/i, /где\s+находится/i, /актуально/i, /еще\s+продается/i,
  // EN
  /how\s+much/i, /price\s*\?/i, /still\s+available/i, /can\s+i\s+view/i, /which\s+district/i
];

const PROPERTY_TYPES: Record<string, string[]> = {
  apartment: [
    'menzil', 'bina evi', 'novostroyka', 'kvartira', 'otaqli', 'komnatnaya', 'apartment', 'flat',
    'квартира', 'квартиру', 'новостройка', 'новостройку', 'мэнзил'
  ],
  house: ['heyet evi', 'dom', 'chastny dom', 'house', 'дом', 'хэет'],
  villa: ['villa', 'bag evi', 'dacha', 'cottage', 'вилла', 'дача'],
  commercial: ['obyekt', 'ofis', 'dukan', 'magaza', 'kommercheskaya', 'office', 'shop', 'commercial', 'объект', 'офис', 'магазин'],
  land: ['torpaq', 'sahe', 'uchastok', 'land', 'plot', 'участок', 'земля'],
};

/**
 * Extracts Azerbaijan Geo (City, District, Metro) from text.
 */
export function extractLeadGeo(text: string): { city?: string | undefined; district?: string | undefined; metro?: string | undefined } {
  const norm = toLatinAscii(text).toLowerCase();
  const rawLower = text.toLowerCase();
  let city: string | undefined;
  let district: string | undefined;
  let metro: string | undefined;

  for (const entry of AZERBAIJAN_GEO_DICTIONARY) {
    for (const alias of entry.aliases) {
      const cleanAlias = toLatinAscii(alias).toLowerCase();
      if (norm.includes(cleanAlias) || rawLower.includes(alias.toLowerCase())) {
        if (entry.type === 'metro') {
          metro = entry.canonical;
          city = 'Bakı';
        } else if (entry.type === 'district') {
          district = entry.canonical;
          city = 'Bakı';
        } else if (entry.type === 'city') {
          city = entry.canonical;
        } else if (entry.type === 'capital') {
          city = 'Bakı';
        }
        break;
      }
    }
  }

  // Common Metro short names check
  const metroShorts: Record<string, string> = {
    'elmler': 'Elmlər Akademiyası',
    'elmlər': 'Elmlər Akademiyası',
    'элмляр': 'Elmlər Akademiyası',
    'гянджлик': 'Gənclik',
    'genclik': 'Gənclik',
    'gənclik': 'Gənclik',
    '28 may': '28 May',
    '28 май': '28 May',
    'нариманов': 'Nəriman Nərimanov',
    'nerimanov': 'Nəriman Nərimanov',
    'nərimanov': 'Nəriman Nərimanov',
    'сахил': 'Sahil',
    'sahil': 'Sahil',
  };

  for (const [mKey, mVal] of Object.entries(metroShorts)) {
    if (norm.includes(mKey) || rawLower.includes(mKey)) {
      if (!metro) {
        metro = mVal;
        city = 'Bakı';
      }
    }
  }

  if (!city && (norm.includes('baki') || norm.includes('baku') || norm.includes('баку'))) {
    city = 'Bakı';
  }

  return { city, district, metro };
}

/**
 * Extracts Property Type from text.
 */
export function extractPropertyType(text: string): string | undefined {
  const norm = toLatinAscii(text).toLowerCase();
  const rawLower = text.toLowerCase();
  for (const [type, synonyms] of Object.entries(PROPERTY_TYPES)) {
    for (const syn of synonyms) {
      if (norm.includes(syn) || rawLower.includes(syn)) return type;
    }
  }
  return undefined;
}

/**
 * Extracts number of rooms from text.
 */
export function extractRooms(text: string): number | undefined {
  const norm = toLatinAscii(text).toLowerCase();
  const raw = text.toLowerCase();

  const m1 = raw.match(/(\d+)\s*[-–]?\s*(?:otaq|otaqli|otaqlı|komnat|komnatnaya|комнат|комнатная|room|bedroom|br|bed)/i);
  if (m1 && m1[1]) {
    const r = parseInt(m1[1], 10);
    if (r >= 1 && r <= 10) return r;
  }
  if (norm.includes('bir otaqli') || norm.includes('1 otaq') || norm.includes('odnushka') || raw.includes('однушка') || raw.includes('1-комнатная')) return 1;
  if (norm.includes('iki otaqli') || norm.includes('2 otaq') || norm.includes('dvushka') || raw.includes('двушка') || raw.includes('2-комнатная')) return 2;
  if (norm.includes('uc otaqli') || norm.includes('3 otaq') || norm.includes('treshka') || raw.includes('трешка') || raw.includes('3-комнатная')) return 3;
  if (norm.includes('dord otaqli') || norm.includes('4 otaq') || raw.includes('4-комнатная')) return 4;
  return undefined;
}

/**
 * Extracts budget amount and currency from text.
 */
export function extractBudget(text: string): { budgetMin?: number | undefined; budgetMax?: number | undefined; currency: string } {
  const raw = text.toLowerCase();
  let currency = 'AZN';
  if (raw.includes('$') || raw.includes('usd') || raw.includes('dollar') || raw.includes('доллар')) currency = 'USD';
  else if (raw.includes('€') || raw.includes('eur') || raw.includes('euro') || raw.includes('евро')) currency = 'EUR';

  // Range match: "150-200 min", "1000-1200 AZN"
  const rangeMatch = raw.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:min|k|azn|manat|\$|usd|манат|долларов)?/i);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    let min = parseFloat(rangeMatch[1]);
    let max = parseFloat(rangeMatch[2]);
    const hasThousand = /\b(?:min|k|тыс|тысяч)\b/i.test(raw);
    if (hasThousand || (max < 1000 && min < 1000 && !raw.includes('kiraye') && !raw.includes('ayliq') && !raw.includes('аренд') && !raw.includes('сниму') && !raw.includes('сдам'))) {
      if (min < 1000) min *= 1000;
      if (max < 1000) max *= 1000;
    }
    return { budgetMin: min, budgetMax: max, currency };
  }

  // Max match: "do 200 000", "до 180 000", "200 min e qeder", "budce 180 min", "up to 1200", "qiymet 1200", "aylıq büdcə 800"
  const maxMatch = raw.match(/(?:do|qeder|budce|büdcə|budcəm|büdcəm|aylıq|ayliq|maksimum|max|qədər|up to|to|до|бюджет|цена|qiymət|qiymet)\s*[:]?\s*(\d+[\s\d]*)\s*(?:min|k|azn|manat|\$|usd|манат|долларов)?/i);
  if (maxMatch && maxMatch[1]) {
    let val = parseFloat(maxMatch[1].replace(/\s+/g, ''));
    const hasThousand = /\b(?:min|k|тыс|тысяч)\b/i.test(raw);
    if (hasThousand && val < 1000 && !raw.includes('kiraye') && !raw.includes('ayliq') && !raw.includes('аренд')) {
      val *= 1000;
    }
    return { budgetMax: val, currency };
  }

  // Single number with min/k/тыс: "220 min", "150k", "200 тыс"
  const singleMatch = raw.match(/(\d+)\s*(?:min|k|тыс|тысяч)\s*(?:azn|manat|\$|usd|манат)?/i);
  if (singleMatch && singleMatch[1]) {
    const val = parseFloat(singleMatch[1]) * 1000;
    return { budgetMax: val, currency };
  }

  return { currency };
}

/**
 * Classifies lead intent and extracts structured lead criteria.
 */
export function classifyLeadIntent(
  text: string,
  options: {
    parentContext?: string | undefined;
    senderPhone?: string | undefined;
    knownRealtorPhones?: Set<string> | undefined;
    isKnownRealtor?: boolean | undefined;
    observedAt?: string | undefined;
  } = {}
): LeadClassificationResult {
  const norm = toLatinAscii(text).toLowerCase();
  const raw = text.toLowerCase();
  const parentNorm = options.parentContext ? toLatinAscii(options.parentContext).toLowerCase() : '';
  const parentRaw = options.parentContext ? options.parentContext.toLowerCase() : '';

  const signals: string[] = [];
  let isBuyer = false;
  let isSeller = false;
  let isRenter = false;
  let isLandlord = false;
  let isInvestor = false;
  let isRealtorRequest = false;
  let isQuestion = false;

  // 1. Check Realtor Request
  for (const pat of REALTOR_REQUEST_PATTERNS) {
    if (pat.test(norm) || pat.test(raw)) {
      signals.push(`realtor_request:${pat.source}`);
      isRealtorRequest = true;
    }
  }

  // 2. Check Investor
  for (const pat of INVESTOR_PATTERNS) {
    if (pat.test(norm) || pat.test(raw)) {
      signals.push(`investor:${pat.source}`);
      isInvestor = true;
    }
  }

  // 3. Check Renter
  for (const pat of RENTER_PATTERNS) {
    if (pat.test(norm) || pat.test(raw)) {
      signals.push(`renter:${pat.source}`);
      isRenter = true;
    }
  }

  // 4. Check Landlord
  for (const pat of LANDLORD_PATTERNS) {
    if (pat.test(norm) || pat.test(raw)) {
      signals.push(`landlord:${pat.source}`);
      isLandlord = true;
    }
  }

  // 5. Check Buyer (if not renter)
  if (!isRenter && !isLandlord) {
    for (const pat of BUYER_PATTERNS) {
      if (pat.test(norm) || pat.test(raw)) {
        signals.push(`buyer:${pat.source}`);
        isBuyer = true;
      }
    }
  }

  // 6. Check Seller
  for (const pat of SELLER_PATTERNS) {
    if (pat.test(norm) || pat.test(raw)) {
      signals.push(`seller:${pat.source}`);
      isSeller = true;
    }
  }

  // 7. Check Question Intent
  for (const pat of QUESTION_PATTERNS) {
    if (pat.test(norm) || pat.test(raw)) {
      signals.push(`question:${pat.source}`);
      isQuestion = true;
    }
  }

  // Determine Sender Realtor Status
  const phones = extractPhones(text);
  const phone = options.senderPhone || (phones[0]?.normalized ?? '');
  const isForeign = Boolean(phone && isForeignRealEstatePhone(phone));
  const isSenderRealtor = Boolean(
    options.isKnownRealtor ||
    (phone && options.knownRealtorPhones?.has(phone)) ||
    isRealtorRequest
  );

  // Extract Entities
  const fullContext = `${options.parentContext || ''} ${text}`;
  const geo = extractLeadGeo(fullContext);
  const propertyType = extractPropertyType(fullContext);
  const rooms = extractRooms(fullContext);
  const budget = extractBudget(text);

  // Intent Decision
  let leadType: LeadType = 'unknown';
  if (isRealtorRequest) {
    leadType = 'realtor_request';
  } else if (isLandlord) {
    leadType = 'landlord';
  } else if (isRenter) {
    leadType = 'renter';
  } else if (isInvestor) {
    leadType = 'investor';
  } else if (isSeller) {
    leadType = 'seller';
  } else if (isBuyer) {
    leadType = 'buyer';
  } else if (isQuestion) {
    const hasPropertyContext = Boolean(
      propertyType ||
      geo.city ||
      geo.district ||
      parentNorm.includes('menzil') ||
      parentNorm.includes('satilir') ||
      parentRaw.includes('квартир') ||
      parentRaw.includes('продает')
    );
    if (hasPropertyContext) {
      leadType = 'buyer';
    }
  }

  const isLead = leadType !== 'unknown' && !isForeign;

  // Confidence Calculation
  let confidence = 0.5;
  if (isLead) {
    if (isBuyer || isSeller || isRenter || isLandlord || isInvestor) confidence += 0.2;
    if (geo.district || geo.metro) confidence += 0.1;
    if (propertyType) confidence += 0.1;
    if (rooms) confidence += 0.05;
    if (budget.budgetMax || budget.budgetMin) confidence += 0.1;
    if (isQuestion && !isBuyer && !isSeller) confidence = Math.min(confidence, 0.65);
  } else {
    confidence = 0.1;
  }
  confidence = Math.min(0.98, Math.max(0.05, confidence));

  let confidenceLevel: ConfidenceLevel = 'low';
  if (confidence >= 0.75) confidenceLevel = 'high';
  else if (confidence >= 0.45) confidenceLevel = 'medium';

  const intentExcerpt = text.slice(0, 300).replace(/\s+/g, ' ').trim();

  return {
    isLead,
    leadType,
    confidence,
    confidenceLevel,
    signals,
    isRealtorSender: isSenderRealtor,
    city: geo.city,
    district: geo.district,
    metro: geo.metro,
    propertyType,
    rooms,
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
    currency: budget.currency,
    intentExcerpt,
    isForeign,
  };
}
