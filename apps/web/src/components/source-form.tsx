'use client';

import { useState } from 'react';
import { t, type Lang } from '../lib/i18n';
import { apiMutation } from './api-button';
import { showToast } from './toast';

export const SOURCE_TYPE_OPTIONS = [
  { value: 'bina_agency', labelKey: 'sourceType.binaAgency' },
  { value: 'tap_az', labelKey: 'sourceType.tapAz' },
  { value: 'arenda_az', labelKey: 'sourceType.arendaAz' },
  { value: 'yeniemlak_az', labelKey: 'sourceType.yeniemlakAz' },
  { value: 'emlakbazari_az', labelKey: 'sourceType.emlakbazariAz' },
  { value: 'ipoteka_az', labelKey: 'sourceType.ipotekaAz' },
  { value: 'city_az', labelKey: 'sourceType.cityAz' },
  { value: 'vipemlak_az', labelKey: 'sourceType.vipemlakAz' },
  { value: 'ev10_az', labelKey: 'sourceType.ev10Az' },
  { value: 'lalafo_az', labelKey: 'sourceType.lalafoAz' },
  { value: 'unvan_az', labelKey: 'sourceType.unvanAz' },
  { value: 'google_maps_query', labelKey: 'sourceType.googleMaps' },
  { value: 'instagram_profile', labelKey: 'sourceType.instagramProfile' },
  { value: 'tiktok_profile', labelKey: 'sourceType.tiktokProfile' },
  { value: 'telegram_channel', labelKey: 'sourceType.telegramChannel' },
  { value: 'telegram_group', labelKey: 'sourceType.telegramGroup' },
  { value: 'facebook_page', labelKey: 'sourceType.facebookPage' },
  { value: 'website', labelKey: 'sourceType.website' },
  { value: 'listing_page', labelKey: 'sourceType.listingPage' },
] as const;

type SourceType = (typeof SOURCE_TYPE_OPTIONS)[number]['value'];
type FormDefaults = { maxPages: number; maxDepth: number; delayMs: number; language: string };

function detectClientSourceType(input: string): SourceType | undefined {
  const trimmed = input.trim();
  if (trimmed.startsWith('@') || trimmed.includes('t.me/') || trimmed.includes('telegram.me/')) {
    return 'telegram_channel';
  }
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'bina.az') return 'bina_agency';
    if (host === 'tap.az') return 'tap_az';
    if (host === 'arenda.az') return 'arenda_az';
    if (host === 'yeniemlak.az') return 'yeniemlak_az';
    if (host === 'emlakbazari.az') return 'emlakbazari_az';
    if (host === 'ipoteka.az') return 'ipoteka_az';
    if (host === 'city.az') return 'city_az';
    if (host === 'vipemlak.az') return 'vipemlak_az';
    if (host === 'ev10.az') return 'ev10_az';
    if (host === 'lalafo.az') return 'lalafo_az';
    if (host === 'unvan.az') return 'unvan_az';
    if (host.includes('instagram.com')) return 'instagram_profile';
    if (host.includes('tiktok.com')) return 'tiktok_profile';
    if (host.includes('t.me') || host.includes('telegram.me')) return 'telegram_channel';
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.me')) return 'facebook_page';
  } catch {
    // ignore
  }
  return undefined;
}

export function getSourceFormDefaults(type: string): FormDefaults {
  if (type === 'bina_agency') {
    return { maxPages: 10, maxDepth: 0, delayMs: 10_000, language: 'AZ' };
  }
  if (
    type === 'tap_az' ||
    type === 'arenda_az' ||
    type === 'yeniemlak_az' ||
    type === 'emlakbazari_az' ||
    type === 'ipoteka_az' ||
    type === 'city_az' ||
    type === 'vipemlak_az' ||
    type === 'ev10_az' ||
    type === 'lalafo_az' ||
    type === 'unvan_az' ||
    type === 'stop_az'
  ) {
    return { maxPages: 20, maxDepth: 0, delayMs: 1_000, language: 'AZ' };
  }
  if (
    type === 'instagram_profile' ||
    type === 'tiktok_profile' ||
    type === 'telegram_channel' ||
    type === 'telegram_group' ||
    type === 'facebook_page'
  ) {
    return { maxPages: 10, maxDepth: 0, delayMs: 2_000, language: 'mixed' };
  }
  return { maxPages: 10, maxDepth: 1, delayMs: 1_000, language: 'AZ' };
}

export function SourceForm({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('bina_agency');
  const [defaults, setDefaults] = useState<FormDefaults>(getSourceFormDefaults('bina_agency'));
  const [locatorValue, setLocatorValue] = useState('');

  const handleLocatorChange = (val: string) => {
    setLocatorValue(val);
    const detected = detectClientSourceType(val);
    if (detected) {
      if (detected !== sourceType) {
        setSourceType(detected);
        setDefaults(getSourceFormDefaults(detected));
      }
    }
  };

  return (
    <form
      className="panel form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const form = new FormData(event.currentTarget);
        try {
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
          if (response.ok) {
            showToast(t(lang, 'toast.sourceSaved'), 'success');
            setTimeout(() => {
              location.reload();
            }, 400);
          } else {
            const errData = (await response.json().catch(() => ({}))) as { error?: string };
            showToast(errData.error || 'Failed to save source', 'error');
            setBusy(false);
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Network error', 'error');
          setBusy(false);
        }
      }}
    >
      <h2>{t(lang, 'sourceForm.title')}</h2>
      <label>
        {t(lang, 'sourceForm.name')}
        <input required name="name" disabled={busy} placeholder="Bina.az / Tap.az / Arenda.az" />
      </label>
      <label>
        {t(lang, 'sourceForm.type')}
        <select
          name="type"
          value={sourceType}
          disabled={busy}
          onChange={(event) => {
            const nextType = event.target.value as SourceType;
            setSourceType(nextType);
            setDefaults(getSourceFormDefaults(nextType));
          }}
        >
          {SOURCE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(lang, option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t(lang, 'sourceForm.locator')}
        <input
          required
          name="locator"
          disabled={busy}
          value={locatorValue}
          onChange={(e) => handleLocatorChange(e.target.value)}
          placeholder="https://..."
        />
      </label>
      <label>
        {t(lang, 'sourceForm.language')}
        <select
          name="language"
          value={defaults.language}
          disabled={busy}
          onChange={(event) => setDefaults({ ...defaults, language: event.target.value })}
        >
          <option>AZ</option>
          <option>RU</option>
          <option>EN</option>
          <option>mixed</option>
        </select>
      </label>
      <label>
        {t(lang, 'sourceForm.pages')}
        <input
          name="maxPages"
          type="number"
          min="1"
          max={sourceType === 'bina_agency' ? 100 : 500}
          value={defaults.maxPages}
          disabled={busy}
          onChange={(event) => setDefaults({ ...defaults, maxPages: Number(event.target.value) })}
        />
      </label>
      <label>
        {t(lang, 'sourceForm.depth')}
        <input
          name="maxDepth"
          type="number"
          min="0"
          max={sourceType === 'bina_agency' || sourceType === 'tap_az' || sourceType === 'arenda_az' ? 0 : 10}
          value={defaults.maxDepth}
          disabled={busy}
          onChange={(event) => setDefaults({ ...defaults, maxDepth: Number(event.target.value) })}
        />
      </label>
      <label>
        {t(lang, 'sourceForm.delay')}
        <input
          name="delayMs"
          type="number"
          min={sourceType === 'bina_agency' ? 10_000 : 0}
          value={defaults.delayMs}
          disabled={busy}
          onChange={(event) => setDefaults({ ...defaults, delayMs: Number(event.target.value) })}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? t(lang, 'sourceForm.saving') : t(lang, 'sourceForm.add')}
      </button>
    </form>
  );
}
