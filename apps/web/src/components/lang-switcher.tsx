'use client';

import type { Lang } from '../lib/i18n';

const languages: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'RU' },
  { code: 'az', label: 'AZ' },
  { code: 'en', label: 'EN' },
];

export function LangSwitcher({ lang }: { lang: Lang }) {
  const handleSelect = async (target: Lang) => {
    if (target === lang) return;
    const formData = new FormData();
    formData.append('lang', target);
    formData.append('next', window.location.pathname + window.location.search);
    try {
      await fetch('/api/lang', { method: 'POST', body: formData });
    } catch {
      // ignore
    }
    document.cookie = `lang=${target}; path=/; max-age=86400; samesite=lax`;
    window.location.reload();
  };

  return (
    <div className="lang-switcher" role="group" aria-label="Language selector">
      {languages.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={`lang-btn ${lang === code ? 'active' : ''}`}
          onClick={() => { void handleSelect(code); }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
