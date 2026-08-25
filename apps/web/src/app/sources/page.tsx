import { ApiButton } from '../../components/api-button';
import { SourceForm } from '../../components/source-form';
import { nextBinaRunAt, readBinaCycleHours, readBinaSummary } from '../../lib/bina-view';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { formatDateTime, t, tEnum } from '../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Sources() {
  const lang = await getLang();
  const repos = getRepositories();
  const cycleHours = readBinaCycleHours(process.env.BINA_CYCLE_HOURS);
  const rows = repos.sources.list();
  const latestRuns = new Map<number, ReturnType<typeof repos.runs.list>[number]>();
  for (const run of repos.runs.list()) if (!latestRuns.has(run.sourceId)) latestRuns.set(run.sourceId, run);
  const summaries = new Map<number, unknown>();
  for (const event of repos.audit.list()) {
    if (event.action === 'run.bina.summary' && event.entityType === 'run') summaries.set(event.entityId, event.details);
  }

  return <>
    <p className="eyebrow">{t(lang, 'sources.eyebrow')}</p>
    <h1>{t(lang, 'sources.title')}</h1>
    <div className="stack">
      <SourceForm lang={lang} />
      <div className="table-wrap"><table>
        <thead><tr><th>{t(lang, 'sources.colName')}</th><th>{t(lang, 'sources.colTypeLang')}</th><th>{t(lang, 'sources.colLocator')}</th><th>{t(lang, 'sources.colLimits')}</th><th>{t(lang, 'sources.colStatus')}</th><th>{t(lang, 'sources.colActions')}</th></tr></thead>
        <tbody>{rows.map((source) => {
          const run = latestRuns.get(source.id);
          const summary = readBinaSummary(run ? summaries.get(run.id) : undefined);
          const bina = source.type === 'bina_agency';
          return <tr key={source.id}>
            <td>{source.name}{bina && <><br /><span className="muted">{t(lang, 'bina.automatic')} · {t(lang, 'bina.interval', { hours: cycleHours })}</span></>}</td>
            <td>{bina ? t(lang, 'sourceType.binaAgency') : source.type}<br /><span className="muted">{source.language}</span></td>
            <td>{source.locator}</td>
            <td>{source.maxPages} {t(lang, 'sources.pages')} · {t(lang, 'sources.depth')} {source.maxDepth}<br />{source.delayMs} ms</td>
            <td>
              <span className="badge">{source.killSwitch ? t(lang, 'sources.killSwitch') : source.enabled ? t(lang, 'sources.enabled') : t(lang, 'sources.disabled')}</span>
              {bina && run && <div className="muted">
                {t(lang, 'bina.lastRun')}: {formatDateTime(lang, run.finishedAt ?? run.startedAt)} · {tEnum(lang, 'run', run.status)}<br />
                {t(lang, 'bina.nextRun')}: {formatDateTime(lang, nextBinaRunAt(run, cycleHours))}<br />
                {t(lang, 'bina.pagesChecked')}: {run.pagesChecked} · {t(lang, 'bina.agenciesFound')}: {summary.agenciesFound}<br />
                {t(lang, 'bina.newContacts')}: {summary.newContacts} · {t(lang, 'bina.duplicates')}: {summary.duplicates} · {t(lang, 'bina.privateSkipped')}: {summary.privateSellers}
                {run.error && <><br />{t(lang, 'bina.stopReason')}: {run.error}</>}
              </div>}
            </td>
            <td><div className="toolbar"><ApiButton url={`/api/sources/${source.id}/run`} label={t(lang, 'sources.run')} /><ApiButton url={`/api/sources/${source.id}/kill`} label={source.killSwitch ? t(lang, 'sources.killOn') : t(lang, 'sources.kill')} kind="danger" /></div></td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>
  </>;
}
