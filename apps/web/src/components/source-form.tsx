'use client';

import { useState } from 'react';
import { t, type Lang } from '../lib/i18n';
import { apiMutation } from './api-button';

export const SOURCE_TYPE_OPTIONS = [
  { value: 'website' },
  { value: 'listing_page' },
  { value: 'google_maps_query' },
  { value: 'instagram_profile' },
  { value: 'instagram_post' },
  { value: 'instagram_hashtag' },
  { value: 'tiktok_profile' },
  { value: 'tiktok_video' },
  { value: 'tiktok_hashtag' },
  { value: 'tiktok_keyword' },
  { value: 'bina_agency', labelKey: 'sourceType.binaAgency' },
] as const;

type SourceType = (typeof SOURCE_TYPE_OPTIONS)[number]['value'];
type FormDefaults = { maxPages: number; maxDepth: number; delayMs: number; language: string };

export function getSourceFormDefaults(type: SourceType): FormDefaults {
  return type === 'bina_agency'
    ? { maxPages: 100, maxDepth: 0, delayMs: 10_000, language: 'AZ' }
    : { maxPages: 10, maxDepth: 1, delayMs: 1_000, language: 'AZ' };
}

export function SourceForm({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('website');
  const [defaults, setDefaults] = useState<FormDefaults>(getSourceFormDefaults('website'));

  return (
    <form
      className="panel form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const form = new FormData(event.currentTarget);
        const response = await apiMutation('/api/sources', 'POST', {
          name: form.get('name'),
          type: form.get('type'),
          locator: form.get('locator'),
          language: form.get('language'),
          maxPages: Number(form.get('maxPages')),
          maxDepth: Number(form.get('maxDepth')),
          delayMs: Number(form.get('delayMs')),
          enabled: true,
          killSwitch: false,
        });
        setBusy(false);
        if (response.ok) location.reload();
        else alert(((await response.json()) as { error?: string }).error);
      }}
    >
      <h2>{t(lang, 'sourceForm.title')}</h2>
      <label>{t(lang, 'sourceForm.name')}<input required name="name" /></label>
      <label>
        {t(lang, 'sourceForm.type')}
        <select
          name="type"
          value={sourceType}
          onChange={(event) => {
            const nextType = event.target.value as SourceType;
            setSourceType(nextType);
            setDefaults(getSourceFormDefaults(nextType));
          }}
        >
          {SOURCE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {'labelKey' in option ? t(lang, option.labelKey) : option.value}
            </option>
          ))}
        </select>
      </label>
      <label>{t(lang, 'sourceForm.locator')}<input required name="locator" /></label>
      <label>
        {t(lang, 'sourceForm.language')}
        <select name="language" value={defaults.language} onChange={(event) => setDefaults({ ...defaults, language: event.target.value })}>
          <option>AZ</option><option>RU</option><option>EN</option><option>mixed</option>
        </select>
      </label>
      <label>
        {t(lang, 'sourceForm.pages')}
        <input name="maxPages" type="number" min="1" max={sourceType === 'bina_agency' ? 100 : 500} value={defaults.maxPages} onChange={(event) => setDefaults({ ...defaults, maxPages: Number(event.target.value) })} />
      </label>
      <label>
        {t(lang, 'sourceForm.depth')}
        <input name="maxDepth" type="number" min="0" max={sourceType === 'bina_agency' ? 0 : 10} value={defaults.maxDepth} onChange={(event) => setDefaults({ ...defaults, maxDepth: Number(event.target.value) })} />
      </label>
      <label>
        {t(lang, 'sourceForm.delay')}
        <input name="delayMs" type="number" min={sourceType === 'bina_agency' ? 10_000 : 0} value={defaults.delayMs} onChange={(event) => setDefaults({ ...defaults, delayMs: Number(event.target.value) })} />
      </label>
      <button disabled={busy}>{busy ? t(lang, 'sourceForm.saving') : t(lang, 'sourceForm.add')}</button>
    </form>
  );
}
