import { cookies } from 'next/headers';
import type { Lang } from './i18n';

export const LANG_COOKIE = 'lang';

export async function getLang(): Promise<Lang> {
  const jar = await cookies();
  const val = jar.get(LANG_COOKIE)?.value;
  if (val === 'az') return 'az';
  if (val === 'en') return 'en';
  return 'ru';
}
