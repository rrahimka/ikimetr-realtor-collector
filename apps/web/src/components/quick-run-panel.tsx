'use client';

import { useState } from 'react';
import { apiMutation } from './api-button';
import { showToast } from './toast';
import { t, type Lang } from '../lib/i18n';

interface BulkResult {
  category: string;
  action: string;
  queued: number;
  alreadyRunning: number;
  disabled: number;
  skipped: number;
  stoppedCount?: number;
  details: Array<{ id: number; name: string; status: string; reason?: string }>;
}

export function QuickRunPanel({ lang, activeRunsCount }: { lang: Lang; activeRunsCount: number }) {
  const [busy, setBusy] = useState<'website' | 'social' | null>(null);
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);

  const handleBulkAction = async (category: 'website' | 'social', action: 'start' | 'stop' = 'start') => {
    setBusy(category);
    try {
      const response = await apiMutation('/api/sources/bulk-run', 'POST', { category, action });
      if (response.ok) {
        const data = (await response.json()) as BulkResult;
        setLastResult(data);
        if (action === 'start') {
          showToast(
            t(lang, 'dashboard.bulkSummary', {
              queued: data.queued,
              alreadyRunning: data.alreadyRunning,
              skipped: data.disabled + data.skipped,
            }),
            'success'
          );
        } else {
          showToast(`Остановлено заданий: ${data.stoppedCount ?? 0}`, 'info');
        }
        // Auto-refresh after a moment to reflect queue state
        setTimeout(() => {
          location.reload();
        }, 1200);
      } else {
        const err = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
        if (err.error === 'GLOBAL_KILL_SWITCH_ACTIVE') {
          showToast(t(lang, 'dashboard.killSwitchActive'), 'error');
        } else {
          showToast(err.message || err.error || 'Bulk run request failed', 'error');
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Network error', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel" style={{ marginTop: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <p className="eyebrow">{t(lang, 'dashboard.bulkSection')}</p>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700 }}>
          {t(lang, 'dashboard.bulkSection')}
        </h2>
        <div className="muted">{t(lang, 'dashboard.bulkSubtitle')}</div>
      </div>

      <div className="toolbar" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => handleBulkAction('website', 'start')}
          style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 700 }}
        >
          {busy === 'website' ? t(lang, 'dashboard.startingAll') : t(lang, 'dashboard.startAllWebsites')}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => handleBulkAction('social', 'start')}
          style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 700 }}
        >
          {busy === 'social' ? t(lang, 'dashboard.startingAll') : t(lang, 'dashboard.startAllSocial')}
        </button>

        {activeRunsCount > 0 && (
          <>
            <button
              type="button"
              className="danger"
              disabled={busy !== null}
              onClick={() => handleBulkAction('website', 'stop')}
              style={{ padding: '10px 14px', fontSize: '12px' }}
            >
              {t(lang, 'dashboard.stopAllWebsites')}
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy !== null}
              onClick={() => handleBulkAction('social', 'stop')}
              style={{ padding: '10px 14px', fontSize: '12px' }}
            >
              {t(lang, 'dashboard.stopAllSocial')}
            </button>
          </>
        )}
      </div>

      {lastResult && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: 'var(--panel-subtle)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            fontSize: '13px',
          }}
        >
          <strong>
            {lastResult.category === 'website' ? 'Веб-сайты' : 'Социальные сети'}:
          </strong>{' '}
          {t(lang, 'dashboard.bulkSummary', {
            queued: lastResult.queued,
            alreadyRunning: lastResult.alreadyRunning,
            skipped: lastResult.disabled + lastResult.skipped,
          })}
        </div>
      )}
    </div>
  );
}
