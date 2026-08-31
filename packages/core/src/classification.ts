import type { Classification, ContactType, ExplicitSellerType, SignalBreakdown } from './contracts';
import {
  AUTO_ACCEPT_WEBSITE_THRESHOLD,
  WHATSAPP_REALTOR_GROUP_AUTO_ACCEPT_THRESHOLD,
  REALTOR_AUTO_ACCEPT_THRESHOLD,
  CONFIDENCE_POLICY_VERSION,
  AUTO_ACCEPT_WEBSITE_POLICY,
  AUTO_ACCEPT_WHATSAPP_POLICY,
  AUTO_ACCEPT_REALTOR_POLICY,
} from './thresholds';
import { resolveOriginGroup } from './origin';
import { analyzeAzerbaijanPhone } from './search-intelligence/phones';

const professionalRegexes = [
  /əmlakçı|daşınmaz əmlak|makler|mənzil satışı|kirayə|vasitəçi/iu,
  /риелтор|маклер|недвижимост|продаж|аренд/iu,
  /real estate|realtor|property agent|house(?:s)? for sale|for rent/iu,
];
const agencyRegex = /(?:\bagency\b|\bagentlik\b|əmlak agentliyi|агентств)/iu;
const locationDealRegex = /(?:baku|bakı|baki|yasamal|nəsimi|nasimi|xətai|khatai|nərimanov|nerimanov|səbail|sabail|binəqədi|bineqedi|nizami|suraxanı|suraxani|sabunçu|sabuncu|abşeron|absheron|xırdalan|khirdalan).*(?:satış|kirayə|satılır|kiraye|elan|mənzil|menzil|ev|otaq|продаж|аренд|квартир|дом|комнат|sale|rent)|(?:satış|kirayə|satılır|kiraye|elan|mənzil|menzil|ev|otaq|продаж|аренд|квартир|дом|комнат|sale|rent).*(?:baku|bakı|baki|yasamal|nəsimi|nasimi|xətai|khatai|nərimanov|nerimanov|səbail|sabail|binəqədi|bineqedi|nizami|suraxanı|suraxani|sabunçu|sabuncu|abşeron|absheron|xırdalan|khirdalan)/iu;
const ownerRegex = /\bowner\b|владелец|собственник|sahib|mülkiyyətçi|mulkiyyetci|şəxsi|sexsi|sahibindən|öz evim|от хозяина|maklerlər narahat etməsin|vasitəçilər narahat etməsin/iu;
const hotlineRegex = /\b(?:142|102|103|112|195|905|support|qaynar xətt|горячая линия)\b/iu;
const platformHotlinePhones = new Set(['+994125990805']);

export interface ClassifyInput {
  text: string;
  occurrenceCount?: number;
  profileDedicated?: boolean;
  explicitSellerType?: ExplicitSellerType | undefined;
  platform?: string;
  sourceType?: string;
  sourceUrl?: string;
  rawPhone?: string;
  normalizedPhone?: string;
  isForeign?: boolean;
  isRealtorOnlyWhatsAppGroup?: boolean;
  alreadyVerifiedInDb?: boolean;
}

export function classifyEvidence(input: ClassifyInput): Classification {
  const text = input.text || '';
  const signals: SignalBreakdown[] = [];
  const reasons: string[] = [];

  const origin = resolveOriginGroup(input.platform, input.sourceType, input.sourceUrl);
  const isExplicitOwner = input.explicitSellerType === 'owner';
  const isExplicitAgency = input.explicitSellerType === 'agency';
  const isExplicitAgent = input.explicitSellerType === 'agent';
  const isOwnerMention = !isExplicitAgency && !isExplicitAgent && ownerRegex.test(text);
  const isHotline = hotlineRegex.test(text) || Boolean(input.rawPhone && hotlineRegex.test(input.rawPhone)) || Boolean(input.normalizedPhone && platformHotlinePhones.has(input.normalizedPhone));
  // Azerbaijan-only phone policy: a present number that is not a valid `+994`
  // national number (foreign or malformed) is forced foreign and can never be
  // auto-accepted. With no phone at all we fall back to the caller's isForeign flag.
  const azPhone = input.normalizedPhone ? analyzeAzerbaijanPhone(input.normalizedPhone) : undefined;
  const isForeign = Boolean(input.isForeign) || (azPhone !== undefined && !azPhone.isValid);
  const isAzMobile = azPhone !== undefined ? azPhone.isMobile : !isForeign;

  // 1. Explicit site indicators
  if (isExplicitAgency) {
    signals.push({ key: 'explicit_site_agency', points: 45, label: 'Сайт явно помечает продавца как агентство (+45)' });
    reasons.push('explicit_site_agency');
    reasons.push('explicit_site_seller_type');
  } else if (isExplicitAgent) {
    signals.push({ key: 'explicit_site_agent', points: 35, label: 'Сайт явно помечает продавца как риелтора (+35)' });
    reasons.push('explicit_site_agent');
    reasons.push('explicit_site_seller_type');
  }

  // 2. WhatsApp Realtor-Only Group
  if (input.isRealtorOnlyWhatsAppGroup) {
    signals.push({ key: 'whatsapp_realtor_group', points: 35, label: 'Подтверждённая группа только для риелторов (+35)' });
    reasons.push('whatsapp_realtor_group');
  }

  // 3. Repeat listings
  const occurrences = input.occurrenceCount ?? 1;
  if (occurrences > 1) {
    const points = Math.min(25, 15 + (occurrences - 2) * 5);
    signals.push({ key: 'phone_repeated_across_listings', points, label: `Номер повторяется в ${occurrences} объявлениях (+${points})` });
    reasons.push('phone_repeated_across_listings');
  }

  // 4. Agency name
  if (agencyRegex.test(text)) {
    signals.push({ key: 'agency_name', points: 20, label: 'Название агентства в тексте (+20)' });
    reasons.push('agency_name');
  }

  // 5. Professional keywords
  const matchedKeywords = professionalRegexes.filter((r) => r.test(text)).length;
  if (matchedKeywords > 0) {
    const points = Math.min(25, 15 + matchedKeywords * 5);
    signals.push({ key: 'professional_keywords', points, label: `Профессиональные ключевые слова (+${points})` });
    reasons.push('professional_keywords');
  }

  // 6. Real estate profile
  if (input.profileDedicated) {
    signals.push({ key: 'real_estate_profile', points: 15, label: 'Профиль посвящён недвижимости (+15)' });
    reasons.push('real_estate_profile');
  }

  // 7. Location & Transaction
  if (locationDealRegex.test(text)) {
    signals.push({ key: 'location_and_transaction', points: 10, label: 'Локация и сделка (+10)' });
    reasons.push('location_and_transaction');
  }

  // 8. Local mobile phone
  if (isAzMobile && !isForeign) {
    signals.push({ key: 'azerbaijan_mobile', points: 10, label: 'Азербайджанский мобильный номер (+10)' });
    reasons.push('azerbaijan_mobile');
  }

  // Determine Type
  let type: ContactType = 'unknown';
  if (isHotline) {
    type = 'suspicious';
    signals.push({ key: 'platform_hotline', points: -100, label: 'Служебный номер / горячая линия (-100)' });
    reasons.push('platform_hotline');
  } else if (isExplicitOwner || isOwnerMention) {
    type = 'owner';
    signals.push({ key: 'owner_direct_seller', points: -60, label: 'Признак прямого собственника (-60)' });
    reasons.push('owner_direct_seller');
    if (isExplicitOwner) {
      reasons.push('explicit_site_seller_type');
    }
  } else if (isExplicitAgency || reasons.includes('agency_name')) {
    type = 'agency';
  } else if (
    isExplicitAgent ||
    reasons.includes('whatsapp_realtor_group') ||
    matchedKeywords > 0 ||
    reasons.includes('phone_repeated_across_listings')
  ) {
    type = 'agent';
  }

  // Calculate score
  let rawScore = 0;
  if (type === 'owner') {
    rawScore = 0;
  } else if (type === 'suspicious') {
    rawScore = 0;
  } else {
    // Sum positive signal points + baseline 15
    const totalPoints = 15 + signals.filter((s) => s.points > 0).reduce((sum, s) => sum + s.points, 0);
    rawScore = Math.min(0.99, Math.max(0.10, totalPoints / 100));
  }

  const confidence = Number(rawScore.toFixed(2));

  // Genuine social platforms (Instagram/TikTok/Facebook) are noisy scraped
  // surfaces: new contacts there stay in manual review (SOCIAL_NEW_CONTACT_AUTO_ACCEPT).
  // Telegram curated channels and verified social contacts are not subject to that
  // hold — they are eligible for realtor auto-confirm below.
  const isGenuineSocialNew =
    origin === 'social' &&
    !input.alreadyVerifiedInDb &&
    /instagram|tiktok|facebook/i.test(`${input.platform ?? ''} ${input.sourceType ?? ''}`);

  // Determine auto-accept
  let autoAccepted = false;
  let autoAcceptPolicy: string | undefined = undefined;

  if (type !== 'owner' && type !== 'suspicious' && !isOwnerMention && isAzMobile) {
    if (origin === 'website' && confidence >= AUTO_ACCEPT_WEBSITE_THRESHOLD) {
      autoAccepted = true;
      autoAcceptPolicy = AUTO_ACCEPT_WEBSITE_POLICY;
    } else if (origin === 'whatsapp' && input.isRealtorOnlyWhatsAppGroup && confidence >= WHATSAPP_REALTOR_GROUP_AUTO_ACCEPT_THRESHOLD) {
      autoAccepted = true;
      autoAcceptPolicy = AUTO_ACCEPT_WHATSAPP_POLICY;
    } else if (origin === 'social' && input.alreadyVerifiedInDb) {
      autoAccepted = true;
      autoAcceptPolicy = 'AUTO_MERGE_VERIFIED_EXISTING';
    } else if (
      (type === 'agent' || type === 'agency') &&
      confidence >= REALTOR_AUTO_ACCEPT_THRESHOLD &&
      !isGenuineSocialNew
    ) {
      // High-confidence realtor classification with a valid Azerbaijan mobile:
      // auto-confirm (covers website / Telegram / WhatsApp / verified social).
      autoAccepted = true;
      autoAcceptPolicy = AUTO_ACCEPT_REALTOR_POLICY;
    }
  }

  return {
    type,
    confidence,
    reasons,
    signals,
    ruleVersion: CONFIDENCE_POLICY_VERSION,
    classifiedAt: new Date().toISOString(),
    autoAccept: autoAccepted,
    autoAccepted,
    autoAcceptPolicy,
  };
}
