/**
 * Search Intelligence Base - Term Tiers (1 to 7)
 * Centralized multilingual dictionary for Azerbaijan Realtor Collection
 */

export interface TermTierDefinition {
  az: string[];
  ru: string[];
  en: string[];
}

/**
 * TIER 1: Strong Realtor / Real Estate Terms
 * High-confidence markers indicating real estate professional activity.
 */
export const TIER_1_REALTOR_TERMS: TermTierDefinition = {
  az: [
    'əmlak',
    'emlak',
    'daşınmaz əmlak',
    'dasinmaz emlak',
    'daşınmaz',
    'dasinmaz',
    'əmlakçı',
    'emlakci',
    'əmlak agenti',
    'emlak agenti',
    'əmlak agentliyi',
    'emlak agentliyi',
    'daşınmaz əmlak agentliyi',
    'dasinmaz emlak agentliyi',
    'agentlik',
    'rieltor',
    'realtor',
    'makler',
    'vasitəçi',
    'vasiteci',
    'broker',
    'əmlak brokeri',
    'emlak brokeri',
    'əmlak məsləhətçisi',
    'emlak meslehetcisi',
    'daşınmaz əmlak mütəxəssisi',
    'dasinmaz emlak mutexessisi',
  ],
  ru: [
    'недвижимость',
    'недвижка',
    'риелтор',
    'риэлтор',
    'маклер',
    'агент недвижимости',
    'агент по недвижимости',
    'агентство недвижимости',
    'риелторское агентство',
    'риэлторское агентство',
    'брокер недвижимости',
    'консультант по недвижимости',
    'специалист по недвижимости',
  ],
  en: [
    'real estate',
    'realestate',
    'realty',
    'realtor',
    'real estate agent',
    'estate agent',
    'property agent',
    'property broker',
    'real estate broker',
    'property consultant',
    'real estate consultant',
    'real estate agency',
    'estate agency',
    'property agency',
    'realty agency',
  ],
};

/**
 * TIER 2: Property Roots
 * Physical property object types.
 */
export const TIER_2_PROPERTY_ROOTS: TermTierDefinition = {
  az: [
    'ev',
    'mənzil',
    'menzil',
    'bina',
    'mülk',
    'mulk',
    'torpaq',
    'obyekt',
    'villa',
    'həyət evi',
    'heyet evi',
    'bağ evi',
    'bag evi',
    'apartament',
    'rezidensiya',
    'residence',
    'kompleks',
    'yaşayış kompleksi',
    'yasayis kompleksi',
    'ofis',
    'mağaza',
    'magaza',
    'anbar',
    'sahə',
    'sahe',
  ],
  ru: [
    'квартира',
    'квартиры',
    'дом',
    'дома',
    'жильё',
    'жилье',
    'объект',
    'участок',
    'земля',
    'вилла',
    'дача',
    'коттедж',
    'офис',
    'коммерческая недвижимость',
    'новостройка',
    'вторичка',
  ],
  en: [
    'property',
    'properties',
    'home',
    'homes',
    'house',
    'houses',
    'apartment',
    'apartments',
    'flat',
    'flats',
    'estate',
    'housing',
    'villa',
    'land',
    'plot',
    'office',
    'commercial property',
    'residence',
    'residential',
  ],
};

/**
 * TIER 3: Transaction Terms
 * Real estate transaction actions and offerings.
 */
export const TIER_3_TRANSACTION_TERMS: TermTierDefinition = {
  az: [
    'satılır',
    'satilir',
    'satılıq',
    'satiliq',
    'satış',
    'satis',
    'satmaq',
    'alqı-satqı',
    'alqi-satqi',
    'almaq',
    'kirayə',
    'kiraye',
    'icarə',
    'icare',
    'kirayə verilir',
    'kiraye verilir',
    'günlük kirayə',
    'gunluk kiraye',
    'aylıq kirayə',
    'ayliq kiraye',
  ],
  ru: [
    'продажа',
    'продается',
    'продаётся',
    'продам',
    'купить',
    'куплю',
    'аренда',
    'снять',
    'сдам',
    'сдается',
    'сдаётся',
    'посуточно',
  ],
  en: [
    'sale',
    'for sale',
    'sell',
    'rent',
    'rental',
    'for rent',
    'lease',
    'for lease',
    'buy',
    'property sale',
  ],
};

/**
 * TIER 4: Agency / Company Terms
 * Organizational and business entity designators.
 */
export const TIER_4_AGENCY_TERMS: TermTierDefinition = {
  az: [
    'agentlik',
    'şirkət',
    'sirket',
    'əmlak şirkəti',
    'emlak sirketi',
    'ofis',
    'mərkəz',
    'merkez',
    'mərkəzi',
    'merkezi',
    'qrup',
    'group',
  ],
  ru: [
    'агентство',
    'компания',
    'центр',
    'бюро',
    'офис',
    'группа',
    'холдинг',
    'партнеры',
  ],
  en: [
    'agency',
    'group',
    'company',
    'partners',
    'holding',
    'team',
    'associates',
    'brokerage',
    'consulting',
    'management',
    'solutions',
    'services',
    'capital',
    'invest',
    'investment',
    'development',
  ],
};

/**
 * Common Brand Suffixes & Modifiers
 * Words commonly attached to real estate roots to form agency or service names.
 */
export const BRAND_SUFFIXES = [
  'Pro',
  'PRO',
  '24',
  '365',
  'Group',
  'Agency',
  'Realty',
  'Estate',
  'RealEstate',
  'Property',
  'Properties',
  'Home',
  'Homes',
  'City',
  'Baku',
  'Azerbaijan',
  'AZ',
  'Caspian',
  'Capital',
  'Invest',
  'Investment',
  'Partners',
  'Team',
  'Expert',
  'Expertise',
  'Premium',
  'Prime',
  'Elite',
  'Luxury',
  'Royal',
  'Prestige',
  'Gold',
  'Platinum',
  'Trust',
  'Center',
  'Centre',
  'Mərkəz',
  'Merkez',
  'Office',
  'Consulting',
  'Management',
  'Solutions',
  'Development',
] as const;

/**
 * TIER 6: Owner / Negative Terms
 * Terms indicating unrelated industries or strictly private owners without agency.
 */
export const TIER_6_NEGATIVE_TERMS = [
  // Automotive
  'avtosalon',
  'avtomobil',
  'masin bazari',
  'maşın alqı',
  'car dealership',
  'auto motors',
  // Beauty & Salons
  'gözəllik salonu',
  'gozellik salonu',
  'vizajist',
  'saç kəsimi',
  'beauty studio',
  'hair stylist',
  // Food & Hospitality
  'restoran',
  'kafe',
  'lounge',
  'fast food',
  'catering',
  // Retail & Fashion
  'geyim',
  'moda',
  'ayaqqabı',
  'kosmetika',
  'boutique',
  'clothing store',
  // Electronics
  'telefon temiri',
  'telefon təmiri',
  'smartfon satisi',
  'komputer servisi',
  // Gaming & Entertainment
  'pubg',
  'gaming',
  'canli yayim',
  'reqs dersleri',
  'rəqs dərsləri',
  // Medical & Health
  'stomatoloq',
  'klinika',
  'aptek',
  'fitness coach',
] as const;

/**
 * TIER 7: Weak / Ambiguous Terms
 * Terms that alone cannot establish a real estate identity, but amplify strong roots.
 */
export const TIER_7_AMBIGUOUS_TERMS = [
  'home',
  'city',
  'pro',
  'group',
  'sales',
  'center',
  'capital',
  'prime',
  'elite',
  'baku',
  'az',
  'expert',
  'consulting',
] as const;
