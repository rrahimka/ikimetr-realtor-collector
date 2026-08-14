import { NextResponse } from 'next/server';
import { LANG_COOKIE } from '../../../lib/lang';
import type { Lang } from '../../../lib/i18n';

function redirectWithLang(request: Request, lang: Lang, next: string) {
  const url = new URL(request.url);
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const res = NextResponse.redirect(new URL(target, url), 303);
  res.cookies.set(LANG_COOKIE, lang, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 86400 });
  return res;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const lang: Lang = form.get('lang') === 'az' ? 'az' : 'ru';
  const nextRaw = form.get('next');
  const next = typeof nextRaw === 'string' ? nextRaw : '/';
  return redirectWithLang(request, lang, next);
}
