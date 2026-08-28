import { NextResponse } from 'next/server';
import { LANG_COOKIE } from '../../../lib/lang';
import type { Lang } from '../../../lib/i18n';

function redirectWithLang(request: Request, lang: Lang, next: string) {
  const url = new URL(request.url);
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const res = NextResponse.redirect(new URL(target, url), 303);
  res.cookies.set(LANG_COOKIE, lang, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 86400 });
  return res;
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  let val: string | null = null;
  let next = '/';
  if (form) {
    val = form.get('lang') as string | null;
    const nextRaw = form.get('next');
    if (typeof nextRaw === 'string') next = nextRaw;
  }
  const lang: Lang = val === 'az' ? 'az' : val === 'en' ? 'en' : 'ru';
  return redirectWithLang(request, lang, next);
}
