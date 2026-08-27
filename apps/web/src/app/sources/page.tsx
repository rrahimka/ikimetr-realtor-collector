import { isSourceSupported } from '@ikimetr/core';
import { ApiButton } from '../../components/api-button';
import { AutoRefresh } from '../../components/auto-refresh';
import { SourceForm } from '../../components/source-form';
import { isContinuousBinaMode, nextBinaRunAt, readBinaCycleHours, readBinaSummary } from '../../lib/bina-view';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { formatDateTime, t, tEnum } from '../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Sources() {
  const lang = await getLang();
  const repos = getRepositories();
  const cycleHours = readBinaCycleHours(process.env.BINA_CYCLE_HOURS);
  const continuous = isContinuousBinaMode(process.env);
  const rows = repos.sources.list();
  const allRuns = repos.runs.list();
  const latestRuns = new Map<number, (typeof allRuns)[number]>();
  let hasActiveRuns = false;

  for (const run of allRuns) {
    if (!latestRuns.has(run.sourceId)) latestRuns.set(run.sourceId, run);
    if (['queued', 'running'].includes(run.status)) {
      hasActiveRuns = true;
    }
  }

  const summaries = new Map<number, unknown>();
  for (const event of repos.audit.list()) {
    if (event.action === 'run.bina.summary' && event.entityType === 'run') {
      summaries.set(event.entityId, event.details);
    }
  }

  return (
    <>
      <AutoRefresh hasActiveRuns={hasActiveRuns} />
      <p className="eyebrow">{t(lang, 'sources.eyebrow')}</p>
      <h1>{t(lang, 'sources.title')}</h1>
      <div className="stack">
        <SourceForm lang={lang} />
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
              {rows.map((source) => {
                const run = latestRuns.get(source.id);
                const isRunning = run && ['queued', 'running'].includes(run.status);
                const summary = readBinaSummary(run ? summaries.get(run.id) : undefined);
                const bina = source.type === 'bina_agency';
                const tap = source.type === 'tap_az';
                const arenda = source.type === 'arenda_az';
                const supported = isSourceSupported(source.type) || isSourceSupported(source.locator) || source.type === 'test_fixture';
                const binaStats = bina && repos.binaListings ? repos.binaListings.stats(source.id) : undefined;

                let typeLabel: string = source.type;
                if (bina) typeLabel = t(lang, 'sourceType.binaAgency');
                else if (tap) typeLabel = t(lang, 'sourceType.tapAz');
                else if (arenda) typeLabel = t(lang, 'sourceType.arendaAz');
                else if (source.type === 'yeniemlak_az') typeLabel = t(lang, 'sourceType.yeniemlakAz');
                else if (source.type === 'emlakbazari_az') typeLabel = t(lang, 'sourceType.emlakbazariAz');
                else if (source.type === 'ipoteka_az') typeLabel = t(lang, 'sourceType.ipotekaAz');
                else if (source.type === 'city_az') typeLabel = t(lang, 'sourceType.cityAz');
                else if (source.type === 'vipemlak_az') typeLabel = t(lang, 'sourceType.vipemlakAz');
                else if (source.type === 'ev10_az') typeLabel = t(lang, 'sourceType.ev10Az');
                else if (source.type === 'lalafo_az') typeLabel = t(lang, 'sourceType.lalafoAz');
                else if (source.type === 'unvan_az') typeLabel = t(lang, 'sourceType.unvanAz');
                else if (source.type === 'stop_az') typeLabel = t(lang, 'sourceType.stopAz');
                else if (source.type === 'website') typeLabel = t(lang, 'sourceType.website');
                else if (source.type === 'listing_page') typeLabel = t(lang, 'sourceType.listingPage');

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
                    <td>
                      <strong>{source.name}</strong>
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
                    <td>
                      {typeLabel}
                      <br />
                      <span className="muted">{source.language}</span>
                    </td>
                    <td>
                      <code>{source.locator}</code>
                    </td>
                    <td>
                      {source.maxPages === 0
                        ? '∞ continuous'
                        : `${source.maxPages} ${t(lang, 'sources.pages')}`}{' '}
                      · {t(lang, 'sources.depth')} {source.maxDepth}
                      <br />
                      {source.delayMs} ms
                    </td>
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
                    <td>
                      <div className="toolbar">
                        {isRunning ? (
                          <button className="button" disabled title={t(lang, 'button.alreadyRunning')}>
                            {t(lang, 'button.alreadyRunning')}
                          </button>
                        ) : !supported ? (
                          <button className="secondary" disabled title={t(lang, 'button.unsupported')}>
                            {t(lang, 'button.unsupported')}
                          </button>
                        ) : (
                          <ApiButton
                            url={`/api/sources/${source.id}/run`}
                            label={t(lang, 'sources.run')}
                            loadingLabel={t(lang, 'button.running')}
                            ackLabel={t(lang, 'button.runCreated')}
                            successToast={t(lang, 'toast.runCreated')}
                            errorToast={t(lang, 'toast.runFailed')}
                          />
                        )}
                        <ApiButton
                          url={`/api/sources/${source.id}/kill`}
                          label={source.killSwitch ? t(lang, 'sources.killOn') : t(lang, 'sources.kill')}
                          kind="danger"
                          successToast={t(lang, 'toast.killToggled')}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
