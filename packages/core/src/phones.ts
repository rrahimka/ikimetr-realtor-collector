import { findPhoneNumbersInText, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface ExtractedPhone { raw: string; normalized?: string; isForeign: boolean; isValid: boolean }

function canonicalInput(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return !trimmed.startsWith('+') && digits.startsWith('994') && digits.length === 12 ? `+${digits}` : trimmed;
}

export function normalizePhone(raw: string, defaultCountry: CountryCode = 'AZ'): ExtractedPhone {
  const phone = parsePhoneNumberFromString(canonicalInput(raw), defaultCountry);
  if (!phone?.isValid()) return { raw, isForeign: false, isValid: false };
  return { raw, normalized: phone.number, isForeign: phone.country !== 'AZ', isValid: true };
}

export function extractPhones(text: string, defaultCountry: CountryCode = 'AZ'): ExtractedPhone[] {
  const candidates = findPhoneNumbersInText(text, defaultCountry).map(({ startsAt, endsAt }) => text.slice(startsAt, endsAt));
  candidates.push(...[...text.matchAll(/(?<!\d)994[\s().-]*(?:10|12|50|51|55|60|70|77|99)[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/g)].map((match) => match[0]));
  const seen = new Set<string>();
  return candidates.map((raw) => normalizePhone(raw, defaultCountry)).filter((phone): phone is ExtractedPhone & { normalized: string } => phone.isValid && Boolean(phone.normalized)).filter((phone) => {
    if (seen.has(phone.normalized)) return false;
    seen.add(phone.normalized);
    return true;
  });
}
