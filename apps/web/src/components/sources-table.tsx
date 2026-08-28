'use client';

import { useState } from 'react';
import { ApiButton } from './api-button';
import { nextBinaRunAt, readBinaSummary } from '../lib/bina-view';
import { formatDateTime, t, tEnum, type Lang } from '../lib/i18n';
import {
  deriveSourceDisplayName,
  formatDelay,
  getSafeSourceUrl,
  getSourceCategory,
  getSourceTypeLabel,
  isSourceSupported,
  type SocialAccountConnection,
  type SocialPlatform,
  type SourceCategory,
  type WhatsAppGroupData,
} from '../lib/source-options';
import { SocialConnectionsPanel } from './social-connections-panel';
import { WhatsAppGroupsTable } from './whatsapp-groups-table';

export interface SourceRowData {
  id: number;
  name: string;
  type: string;
  locator: string;
  language: string;
  maxPages: number;
  maxDepth: number;
  delayMs: number;
  enabled: boolean;
  killSwitch: boolean;
}

export interface RunRowData {
  id: number;
  sourceId: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  pagesChecked: number;
  phonesFound: number;
  uniquePhones: number;
  error: string | null;
}

export interface SourcesTableProps {
  lang: Lang;
  sources: SourceRowData[];
  latestRuns: Record<number, RunRowData | undefined>;
  summaries: Record<number, unknown>;
  binaStatsMap: Record<number, { totalDiscovered: number; professionalCount: number } | undefined>;
  cycleHours: number;
  continuous: boolean;
  initialSocialAccounts?: Record<SocialPlatform, SocialAccountConnection>;
  initialWhatsAppGroups?: WhatsAppGroupData[];
}

export function SourcesTable({
  lang,
  sources,
  latestRuns,
  summaries,
  binaStatsMap,
  cycleHours,
  continuous,
  initialSocialAccounts,
  initialWhatsAppGroups,
}: SourcesTableProps) {
  const [filter, setFilter] = useState<'all' | SourceCategory>('all');

  const totalCount = sources.length;
  const websiteSources = sources.filter((s) => getSourceCategory(s.type || s.locator) === 'website');
  const socialSources = sources.filter((s) => getSourceCategory(s.type || s.locator) === 'social');

  const showWebsites = filter === 'all' || filter === 'website';
  const showSocials = filter === 'all' || filter === 'social';

  const renderTable = (items: SourceRowData[], emptyMessage: string) => {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t(lang, 'sources.colName')}</th>
              <th>{t(lang, 'sources.colTypeLang')}</th>
              <th>{t(lang, 'sources.colLocator')}</th>
              <th>{t(lang, 'sources.colLimits')}</th>
              <th>{t(lang, 'sources.colStatus')}</th>
              <th>{t(lang, 'sources.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((source) => {
                const run = latestRuns[source.id];
                const isRunning = run && ['queued', 'running'].includes(run.status);
                const summary = readBinaSummary(run ? summaries[run.id] : undefined);
                const bina = source.type === 'bina_agency';
                const supported =
                  isSourceSupported(source.type) ||
                  isSourceSupported(source.locator) ||
                  source.type === 'test_fixture';
                const binaStats = bina ? binaStatsMap[source.id] : undefined;

                const displayName = deriveSourceDisplayName(source);
                const typeLabel = getSourceTypeLabel(source.type, lang);
                const safeUrl = getSafeSourceUrl(source.locator);

                let statusBadge = (
                  <span className="badge badge-success">{t(lang, 'sourceStatus.working')}</span>
                );
                if (isRunning) {
                  statusBadge = (
                    <span className="badge badge-info">{t(lang, 'sourceStatus.running')}</span>
                  );
                } else if (source.killSwitch) {
                  statusBadge = (
                    <span className="badge badge-danger">{t(lang, 'sources.killSwitch')}</span>
                  );
                } else if (!source.enabled) {
                  statusBadge = (
                    <span className="badge badge-muted">{t(lang, 'sources.disabled')}</span>
                  );
                } else if (!supported) {
                  statusBadge = (
                    <span className="badge badge-muted">{t(lang, 'sourceStatus.unsupported')}</span>
                  );
                }

                return (
                  <tr key={source.id}>
                    {/* Col 1: Name / Source Identity */}
                    <td>
                      <strong>{displayName}</strong>
                      {bina && (
                        <>
                          <br />
                          <span className="muted">
                            {continuous
                              ? t(lang, 'bina.modeContinuous')
                              : `${t(lang, 'bina.automatic')} · ${t(lang, 'bina.interval', { hours: cycleHours })}`}
                          </span>
                        </>
                      )}
                    </td>

                    {/* Col 2: Type / Language */}
                    <td>
                      {typeLabel}
                      <br />
                      <span className="muted">{source.language}</span>
                    </td>

                    {/* Col 3: Clickable Locator or plain query */}
                    <td>
                      {safeUrl ? (
                        <a
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="source-locator-link"
                          title={`Открыть источник: ${source.locator}`}
                        >
                          <code>{source.locator}</code>
                          <span style={{ fontSize: '12px', userSelect: 'none' }}>↗</span>
                        </a>
                      ) : (
                        <code>{source.locator}</code>
                      )}
                    </td>

                    {/* Col 4: Limits with delay in seconds */}
                    <td>
                      {source.maxPages === 0
                        ? '∞ continuous'
                        : `${source.maxPages} ${t(lang, 'sources.pages')}`}
                      <br />
                      {formatDelay(source.delayMs)}
                    </td>

                    {/* Col 5: Status and run summary */}
                    <td>
                      {statusBadge}
                      {bina && run && (
                        <div className="muted" style={{ marginTop: '6px' }}>
                          {t(lang, 'bina.lastRun')}:{' '}
                          {formatDateTime(lang, run.finishedAt ?? run.startedAt)} ·{' '}
                          {tEnum(lang, 'run', run.status)}
                          <br />
                          {t(lang, 'bina.nextRun')}:{' '}
                          {formatDateTime(lang, nextBinaRunAt(run, cycleHours, continuous))}
                          <br />
                          {t(lang, 'bina.pagesChecked')}: {run.pagesChecked} ·{' '}
                          {t(lang, 'bina.agenciesFound')}: {summary.agenciesFound}
                          <br />
                          {t(lang, 'bina.newContacts')}: {summary.newContacts} ·{' '}
                          {t(lang, 'bina.duplicates')}: {summary.duplicates} ·{' '}
                          {t(lang, 'bina.privateSkipped')}: {summary.privateSellers}
                          {binaStats && binaStats.totalDiscovered > 0 && (
                            <>
                              <br />
                              {t(lang, 'bina.discovered')}: {binaStats.totalDiscovered} ·{' '}
                              {t(lang, 'bina.professional')}: {binaStats.professionalCount}
                            </>
                          )}
                          {run.error && (
                            <>
                              <br />
                              <span className="error">
                                {t(lang, 'bina.stopReason')}: {run.error}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      {!bina && run && (
                        <div className="muted" style={{ marginTop: '6px' }}>
                          {formatDateTime(lang, run.finishedAt ?? run.startedAt)} ·{' '}
                          {tEnum(lang, 'run', run.status)}
                          <br />
                          {t(lang, 'runs.colFound')}: {run.phonesFound} / {run.uniquePhones}
                          {run.error && (
                            <>
                              <br />
                              <span className="error">{run.error}</span>
                            </>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Col 6: Normal Start / Stop Action Controls */}
                    <td>
                      <div className="toolbar">
                        {isRunning && run ? (
                          <ApiButton
                            url={`/api/runs/${run.id}/cancel`}
                            label={t(lang, 'sources.actionStop')}
                            loadingLabel={t(lang, 'sources.actionStopping')}
                            kind="danger"
                            successToast={t(lang, 'toast.sourceStopped')}
                            errorToast={t(lang, 'toast.stopFailed')}
                          />
                        ) : !supported ? (
                          <button className="secondary" disabled title={t(lang, 'button.unsupported')}>
                            {t(lang, 'button.unsupported')}
                          </button>
                        ) : (
                          <ApiButton
                            url={`/api/sources/${source.id}/run`}
                            label={t(lang, 'sources.actionStart')}
                            loadingLabel={t(lang, 'sources.actionStarting')}
                            ackLabel={t(lang, 'button.runCreated')}
                            successToast={t(lang, 'toast.runCreated')}
                            errorToast={t(lang, 'toast.runFailed')}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Category filter tabs */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          className={`source-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t(lang, 'sources.filterAll')} ({totalCount})
        </button>
        <button
          type="button"
          className={`source-filter-btn ${filter === 'website' ? 'active' : ''}`}
          onClick={() => setFilter('website')}
        >
          {t(lang, 'sources.filterWebsites')} ({websiteSources.length})
        </button>
        <button
          type="button"
          className={`source-filter-btn ${filter === 'social' ? 'active' : ''}`}
          onClick={() => setFilter('social')}
        >
          {t(lang, 'sources.filterSocial')} ({socialSources.length})
        </button>
      </div>

      {/* Website Category Section */}
      {showWebsites && (
        <div>
          {filter === 'all' && (
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
              {t(lang, 'sources.categoryWebsite')}
            </h2>
          )}
          {renderTable(websiteSources, 'Нет веб-сайтов в списке источников')}
        </div>
      )}

      {/* Social Category Section */}
      {showSocials && (
        <div style={{ marginTop: filter === 'all' ? '12px' : '0' }}>
          {initialSocialAccounts && (
            <SocialConnectionsPanel
              lang={lang}
              initialAccounts={initialSocialAccounts}
            />
          )}

          {initialWhatsAppGroups && (
            <WhatsAppGroupsTable
              lang={lang}
              initialGroups={initialWhatsAppGroups}
            />
          )}

          {socialSources.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3>Индивидуальные ссылки соцсетей ({socialSources.length})</h3>
              {renderTable(socialSources, 'Нет дополнительных ссылок соцсетей')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
