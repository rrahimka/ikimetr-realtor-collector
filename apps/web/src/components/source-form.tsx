'use client';

import { useState } from 'react';
import {
  DEFAULT_MAX_ITEMS_PER_RUN,
  deriveSourceDisplayName,
  detectClientSourceType,
  getSourceCategory,
  getSourceFormDefaults,
  SOCIAL_SOURCE_OPTIONS,
  type SourceCategory,
  type SourceType,
  WEBSITE_SOURCE_OPTIONS,
} from '../lib/source-options';
import { t, type Lang } from '../lib/i18n';
import { apiMutation } from './api-button';
import { showToast } from './toast';

export function SourceForm({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<SourceCategory>('website');
  const [sourceType, setSourceType] = useState<SourceType>('bina_agency');
  const [locatorValue, setLocatorValue] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<number>(10);
  const [language, setLanguage] = useState<string>('AZ');

  const currentOptions = category === 'social' ? SOCIAL_SOURCE_OPTIONS : WEBSITE_SOURCE_OPTIONS;

  const handleCategoryChange = (nextCat: SourceCategory) => {
    setCategory(nextCat);
    const firstOption = nextCat === 'social' ? SOCIAL_SOURCE_OPTIONS[0] : WEBSITE_SOURCE_OPTIONS[0];
    setSourceType(firstOption.value);
    setDelaySeconds(firstOption.defaultDelaySeconds);
    setLanguage(firstOption.defaultLang);
  };

  const handleTypeChange = (nextType: SourceType) => {
    setSourceType(nextType);
    const defaults = getSourceFormDefaults(nextType);
    setDelaySeconds(defaults.delaySeconds);
    setLanguage(defaults.language);
  };

  const handleLocatorChange = (val: string) => {
    setLocatorValue(val);
    const detected = detectClientSourceType(val);
    if (detected) {
      const detectedCategory = getSourceCategory(detected);
      if (detectedCategory !== category) {
        setCategory(detectedCategory);
      }
      if (detected !== sourceType) {
        setSourceType(detected);
        const defaults = getSourceFormDefaults(detected);
        setDelaySeconds(defaults.delaySeconds);
        setLanguage(defaults.language);
      }
    }
  };

  const activeOption = currentOptions.find((o) => o.value === sourceType);
  const dynamicPlaceholder =
    activeOption?.placeholder || (category === 'social' ? 'https://t.me/... / @username / поисковая фраза' : 'https://...');

  return (
    <form
      className="panel form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);

        const safeDelaySeconds = Number.isFinite(Number(delaySeconds)) && Number(delaySeconds) >= 0 ? Number(delaySeconds) : 1;
        let delayMs = Math.round(safeDelaySeconds * 1000);
        if (sourceType === 'bina_agency') {
          delayMs = Math.max(10_000, delayMs);
        }

        const maxDepth = sourceType === 'bina_agency' || sourceType === 'tap_az' || sourceType === 'arenda_az' ? 0 : (sourceType === 'website' ? 1 : 0);
        const derivedName = deriveSourceDisplayName({ type: sourceType, locator: locatorValue });

        try {
          const response = await apiMutation('/api/sources', 'POST', {
            name: derivedName,
            type: sourceType,
            locator: locatorValue,
            language,
            maxPages: DEFAULT_MAX_ITEMS_PER_RUN,
            maxDepth,
            delayMs,
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

      {/* Field 1: Category */}
      <label>
        {t(lang, 'sourceForm.category')}
        <select
          name="category"
          value={category}
          disabled={busy}
          onChange={(e) => handleCategoryChange(e.target.value as SourceCategory)}
        >
          <option value="website">{t(lang, 'sources.categoryWebsite')}</option>
          <option value="social">{t(lang, 'sources.categorySocial')}</option>
        </select>
      </label>

      {/* Field 2: Specific Source / Platform */}
      <label>
        {t(lang, 'sourceForm.type')}
        <select
          name="type"
          value={sourceType}
          disabled={busy}
          onChange={(event) => handleTypeChange(event.target.value as SourceType)}
        >
          {currentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(lang, option.labelKey)}
            </option>
          ))}
        </select>
      </label>

      {/* Field 3: Locator (URL or query) */}
      <label>
        {t(lang, 'sourceForm.locator')}
        <input
          required
          name="locator"
          disabled={busy}
          value={locatorValue}
          onChange={(e) => handleLocatorChange(e.target.value)}
          placeholder={dynamicPlaceholder}
        />
      </label>

      {/* Field 4: Language */}
      <label>
        {t(lang, 'sourceForm.language')}
        <select
          name="language"
          value={language}
          disabled={busy}
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="AZ">AZ</option>
          <option value="RU">RU</option>
          <option value="EN">EN</option>
          <option value="mixed">mixed</option>
        </select>
      </label>

      {/* Field 5: Delay in seconds */}
      <label>
        {t(lang, 'sourceForm.delay')}
        <input
          name="delaySeconds"
          type="number"
          step="0.5"
          min={sourceType === 'bina_agency' ? '10' : '0'}
          value={delaySeconds}
          disabled={busy}
          onChange={(event) => setDelaySeconds(Number(event.target.value))}
        />
        <span className="muted" style={{ fontSize: '11px', marginTop: '2px', display: 'block' }}>
          {t(lang, 'sourceForm.delayHelp')}
        </span>
      </label>

      {/* Submit button */}
      <button type="submit" disabled={busy} style={{ alignSelf: 'flex-end' }}>
        {busy ? t(lang, 'sourceForm.saving') : t(lang, 'sourceForm.add')}
      </button>
    </form>
  );
}
