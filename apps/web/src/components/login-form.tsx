'use client';

import { useState } from 'react';
import { t, type Lang } from '../lib/i18n';

export function LoginForm({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);

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
            body: JSON.stringify({
              login: form.get('login'),
              password: form.get('password'),
            }),
          });
          if (response.ok) {
            location.href = '/';
          } else if (response.status === 429) {
            setError(t(lang, 'login.tooManyAttempts'));
            setBusy(false);
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

      {/* Login / Email field */}
      <label style={{ marginBottom: '14px' }}>
        {t(lang, 'login.loginOrEmail')}
        <input
          name="login"
          type="text"
          defaultValue="admin"
          autoComplete="username"
          disabled={busy}
        />
      </label>

      {/* Password field with Eye toggle */}
      <label style={{ marginBottom: '8px' }}>
        {t(lang, 'login.password')}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            required
            disabled={busy}
            style={{ width: '100%', paddingRight: '42px' }}
          />
          <button
            type="button"
            className="password-eye-btn"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? t(lang, 'login.hidePassword') : t(lang, 'login.showPassword')}
            title={showPassword ? t(lang, 'login.hidePassword') : t(lang, 'login.showPassword')}
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'none',
            }}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </label>

      {/* Forgot Password Link & Memory Hint */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          className="forgot-password-btn"
          onClick={() => setShowHint(!showHint)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '12px',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            justifyContent: 'flex-start',
            textDecoration: 'underline',
            boxShadow: 'none',
          }}
        >
          {t(lang, 'login.forgotPassword')}
        </button>

        {showHint && (
          <div
            className="password-hint-card"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--panel-subtle)',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              fontSize: '12px',
              color: 'var(--text)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{t(lang, 'login.hintLabel')} </span>
            <code style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent)' }}>
              {t(lang, 'login.hintText')}
            </code>
          </div>
        )}
      </div>

      {error && (
        <p className="error" role="alert" style={{ marginBottom: '14px' }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} style={{ width: '100%' }}>
        {busy ? t(lang, 'login.loggingIn') : t(lang, 'login.submit')}
      </button>
    </form>
  );
}
