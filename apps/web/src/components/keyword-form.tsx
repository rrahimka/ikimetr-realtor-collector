'use client';

import { useState } from 'react';
import { t, type Lang } from '../lib/i18n';
import { apiMutation } from './api-button';

export function KeywordForm({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="toolbar panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        // Language is intentionally omitted — the keywords API defaults to `mixed`.
        const r = await apiMutation('/api/keywords', 'POST', { value: f.get('value') });
        setBusy(false);
        if (r.ok) location.reload();
        else alert(((await r.json()) as { error?: string }).error);
      }}
    >
      <input required name="value" placeholder={t(lang, 'keywordForm.placeholder')} />
      <button disabled={busy}>{t(lang, 'keywordForm.add')}</button>
    </form>
  );
}
