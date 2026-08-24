import type { Classification, ContactType } from './contracts';

const professional = [/əmlakçı|daşınmaz əmlak|makler|mənzil satışı|kirayə/iu, /риелтор|маклер|недвижимост|продаж|аренд/iu, /real estate|realtor|property agent|house(?:s)? for sale|for rent/iu];
const agency = /(?:\bagency\b|\bagentlik\b|əmlak agentliyi|агентств)/iu;
const locationDeal = /(?:baku|bakı|baki).*(?:satış|kirayə|продаж|аренд|sale|rent)|(?:satış|kirayə|продаж|аренд|sale|rent).*(?:baku|bakı|baki)/iu;
const owner = /\bowner\b|владелец|собственник|sahib/iu;

export function classifyEvidence(input: { text: string; occurrenceCount?: number; profileDedicated?: boolean }): Classification {
  const reasons: string[] = [];
  const matches = professional.filter((rule) => rule.test(input.text)).length;
  if (matches > 0) reasons.push('professional_keywords');
  if (locationDeal.test(input.text)) reasons.push('location_and_transaction');
  if ((input.occurrenceCount ?? 1) > 1) reasons.push('phone_repeated_across_listings');
  if (input.profileDedicated) reasons.push('real_estate_profile');
  if (agency.test(input.text)) reasons.push('agency_name');
  let type: ContactType = 'unknown';
  if (reasons.includes('agency_name')) type = 'agency';
  else if (matches > 0) type = 'agent';
  else if (owner.test(input.text)) type = 'owner';
  const score = Math.min(0.98, (type === 'owner' ? 0.4 : 0.25) + reasons.length * 0.2 + matches * 0.1);
  return { type, confidence: Number(score.toFixed(2)), reasons, ruleVersion: '1.0.0', classifiedAt: new Date().toISOString() };
}
