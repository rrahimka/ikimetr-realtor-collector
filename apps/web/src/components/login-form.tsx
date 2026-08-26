'use client';

import { useState } from 'react';
import { t, type Lang } from '../lib/i18n';

export function LoginForm({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <form
      className="login panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = new FormData(e.currentTarget);
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: form.get('password') }),
          });
          if (response.ok) {
            location.href = '/';
          } else {
            setError(t(lang, 'login.error'));
            setBusy(false);
          }
        } catch {
          setError(t(lang, 'login.error'));
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow">{t(lang, 'login.subtitle')}</p>
      <h1>{t(lang, 'login.title')}</h1>
      <label>
        {t(lang, 'login.password')}
        <input name="password" type="password" autoFocus required disabled={busy} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? t(lang, 'login.loggingIn') : t(lang, 'login.submit')}
      </button>
    </form>
  );
}
