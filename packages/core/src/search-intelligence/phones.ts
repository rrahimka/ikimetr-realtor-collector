/**
 * Search Intelligence Base - Azerbaijan Phone & Identity Validation
 */

export const AZ_COUNTRY_CODE = '+994';

export const AZ_MOBILE_PREFIXES = ['10', '50', '51', '55', '60', '70', '77', '99'] as const;

export const AZ_FIXED_PREFIXES = ['12', '18', '20', '21', '22', '23', '24', '25', '26'] as const;

export type AzPhoneType = 'mobile' | 'fixed' | 'foreign' | 'invalid';

/**
 * Validates whether a phone number belongs to Azerbaijan national numbering plan.
 */
export function analyzeAzerbaijanPhone(normalizedPhone: string): {
  isValid: boolean;
  type: AzPhoneType;
  prefix?: string;
  isMobile: boolean;
} {
  const clean = normalizedPhone.replace(/\s+/g, '');

  if (!clean.startsWith('+994')) {
    if (clean.startsWith('+')) {
      return { isValid: false, type: 'foreign', isMobile: false };
    }
    return { isValid: false, type: 'invalid', isMobile: false };
  }

  const nationalNumber = clean.slice(4); // digits after +994
  if (nationalNumber.length !== 9 || !/^\d{9}$/.test(nationalNumber)) {
    return { isValid: false, type: 'invalid', isMobile: false };
  }

  const prefix = nationalNumber.slice(0, 2);

  if ((AZ_MOBILE_PREFIXES as readonly string[]).includes(prefix)) {
    return { isValid: true, type: 'mobile', prefix, isMobile: true };
  }

  if ((AZ_FIXED_PREFIXES as readonly string[]).includes(prefix)) {
    return { isValid: true, type: 'fixed', prefix, isMobile: false };
  }

  return { isValid: false, type: 'invalid', isMobile: false };
}

/**
 * Checks if phone is an Azerbaijan mobile phone (+994 50/51/55/70/77/99/10/60).
 */
export function isAzerbaijanMobileNumber(normalizedPhone: string): boolean {
  return analyzeAzerbaijanPhone(normalizedPhone).isMobile;
}

/**
 * Rejection filter for Turkish real estate listings (+90...) or foreign numbers.
 */
export function isForeignRealEstatePhone(phone: string): boolean {
  const clean = phone.replace(/[\s().-]/g, '');
  if (clean.startsWith('+90') || clean.startsWith('0090') || clean.startsWith('+7') || clean.startsWith('+995')) {
    return true;
  }
  return !clean.startsWith('+994');
}
