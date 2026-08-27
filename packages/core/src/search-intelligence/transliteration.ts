/**
 * Search Intelligence Base - Transliteration & Separator Variant Generator
 */

export const AZ_CHAR_MAP: Record<string, string> = {
  ə: 'e',
  Ə: 'E',
  ş: 's',
  Ş: 'S',
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ö: 'o',
  Ö: 'O',
  ü: 'u',
  Ü: 'U',
  ı: 'i',
  I: 'i',
  İ: 'i',
};

/**
 * Transliterates Azerbaijani-specific characters to Latin ASCII equivalents.
 */
export function toLatinAscii(text: string): string {
  let res = '';
  for (const char of text) {
    res += AZ_CHAR_MAP[char] || char;
  }
  return res;
}

/**
 * Normalizes text to lowercase Latin ASCII, stripping extraneous punctuation.
 */
export function normalizeSearchTerm(text: string): string {
  return toLatinAscii(text.toLowerCase())
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates spelling & transliteration aliases for a term.
 */
export function getTermAliases(term: string): string[] {
  const normalized = term.trim().toLowerCase();
  const latinized = toLatinAscii(normalized);

  const aliases = new Set<string>([normalized, latinized]);

  // Handle common typo & spelling equivalences
  if (normalized.includes('rieltor')) aliases.add(normalized.replace(/rieltor/g, 'realtor'));
  if (normalized.includes('realtor')) aliases.add(normalized.replace(/realtor/g, 'rieltor'));
  if (normalized.includes('риелтор')) aliases.add(normalized.replace(/риелтор/g, 'риэлтор'));
  if (normalized.includes('риэлтор')) aliases.add(normalized.replace(/риэлтор/g, 'риелтор'));
  if (normalized.includes('dasinmaz')) aliases.add(normalized.replace(/dasinmaz/g, 'dashinmaz'));

  return Array.from(aliases);
}

export type SeparatorStyle = 'space' | 'joined' | 'underscore' | 'hyphen' | 'dot';

/**
 * Generates all joined and separated formatting variants for a list of tokens.
 */
export function formatTokenVariants(tokens: string[]): Record<SeparatorStyle, string> {
  const cleanTokens = tokens.map(t => toLatinAscii(t.toLowerCase()).replace(/[^a-z0-9]/g, '')).filter(Boolean);
  return {
    space: cleanTokens.join(' '),
    joined: cleanTokens.join(''),
    underscore: cleanTokens.join('_'),
    hyphen: cleanTokens.join('-'),
    dot: cleanTokens.join('.'),
  };
}

/**
 * Generates all formatted string variations (including reverse order) for given tokens.
 */
export function generateTokenPermutations(tokens: string[]): string[] {
  if (tokens.length === 0) return [];
  if (tokens.length === 1) {
    const single = toLatinAscii(tokens[0]!.toLowerCase()).replace(/[^a-z0-9]/g, '');
    return [single];
  }

  const results = new Set<string>();

  // Forward order
  const forward = formatTokenVariants(tokens);
  results.add(forward.space);
  results.add(forward.joined);
  results.add(forward.underscore);
  results.add(forward.hyphen);
  results.add(forward.dot);

  // Reverse order (for 2-word combinations)
  if (tokens.length === 2) {
    const reversed = formatTokenVariants([tokens[1]!, tokens[0]!]);
    results.add(reversed.space);
    results.add(reversed.joined);
    results.add(reversed.underscore);
    results.add(reversed.hyphen);
    results.add(reversed.dot);
  }

  return Array.from(results).filter(Boolean);
}
