import { ApiButton } from '../../components/api-button';
import { nextBinaRunAt, readBinaSummary } from '../../lib/bina-view';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { formatDateTime, t, tEnum } from '../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Runs() {
  const lang = await getLang();
  const repos = getRepositories();
  const sourceRows = repos.sources.list();
  const sourceNames = new Map(sourceRows.map((source) => [source.id, source.name]));
  const sourceTypes = new Map(sourceRows.map((source) => [source.id, source.type]));
  const summaries = new Map<number, unknown>();
  for (const event of repos.audit.list()) {
    if (event.action === 'run.bina.summary' && event.entityType === 'run') summaries.set(event.entityId, event.details);
  }
  const rows = repos.runs.list();

  return <>
    <p className="eyebrow">{t(lang, 'runs.eyebrow')}</p>
    <h1>{t(lang, 'runs.title')}</h1>
    <div className="table-wrap"><table>
      <thead><tr><th>{t(lang, 'runs.colSource')}</th><th>{t(lang, 'runs.colStatus')}</th><th>{t(lang, 'runs.colTimes')}</th><th>{t(lang, 'runs.colPages')}</th><th>{t(lang, 'runs.colFound')}</th><th>{t(lang, 'runs.colError')}</th><th></th></tr></thead>
      <tbody>{rows.map((run) => {
        const bina = sourceTypes.get(run.sourceId) === 'bina_agency';
        const summary = readBinaSummary(summaries.get(run.id));
        return <tr key={run.id}>
          <td>{sourceNames.get(run.sourceId) ?? run.sourceId}{bina && <><br /><span className="muted">{t(lang, 'sourceType.binaAgency')}</span></>}</td>
          <td><span className="badge">{tEnum(lang, 'run', run.status)}</span>{run.needsReview && ` · ${t(lang, 'runs.review')}`}</td>
          <td>{formatDateTime(lang, run.startedAt)}<br />{formatDateTime(lang, run.finishedAt)}{bina && <><br /><span className="muted">{t(lang, 'bina.nextRun')}: {formatDateTime(lang, nextBinaRunAt(run))}</span></>}</td>
          <td>{run.pagesChecked}</td>
          <td>{run.phonesFound} / {run.uniquePhones}{bina && <><br /><span className="muted">{t(lang, 'bina.agenciesFound')}: {summary.agenciesFound} · {t(lang, 'bina.newContacts')}: {summary.newContacts}<br />{t(lang, 'bina.duplicates')}: {summary.duplicates} · {t(lang, 'bina.privateSkipped')}: {summary.privateSellers}</span></>}</td>
          <td className="error">{run.error ? `${bina ? `${t(lang, 'bina.stopReason')}: ` : ''}${run.error}` : '—'}</td>
          <td>{['queued', 'running'].includes(run.status) && <ApiButton url={`/api/runs/${run.id}/cancel`} label={t(lang, 'runs.stop')} kind="danger" />}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </>;
}
