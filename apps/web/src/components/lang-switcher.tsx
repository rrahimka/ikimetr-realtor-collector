'use client';
import type { Lang } from '../lib/i18n';

export function LangSwitcher({ lang }: { lang: Lang }) {
  const target: Lang = lang === 'ru' ? 'az' : 'ru';
  const setLang = () => {
    document.cookie = `lang=${target}; path=/; max-age=86400; samesite=lax`;
    location.reload();
  };
  return <button type="button" className="lang" onClick={setLang}>{target.toUpperCase()}</button>;
}
