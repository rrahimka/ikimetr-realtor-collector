import { AutoRefresh } from '../../components/auto-refresh';
import { SourceForm } from '../../components/source-form';
import { SourcesTable, type RunRowData, type SourceRowData } from '../../components/sources-table';
import { isContinuousBinaMode, readBinaCycleHours } from '../../lib/bina-view';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { t } from '../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Sources() {
  const lang = await getLang();
  const repos = getRepositories();
  const cycleHours = readBinaCycleHours(process.env.BINA_CYCLE_HOURS);
  const continuous = isContinuousBinaMode(process.env);
  const rows = repos.sources.list();
  const allRuns = repos.runs.list();
  const latestRuns: Record<number, RunRowData> = {};
  let hasActiveRuns = false;

  for (const run of allRuns) {
    if (!latestRuns[run.sourceId]) {
      latestRuns[run.sourceId] = {
        id: run.id,
        sourceId: run.sourceId,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        pagesChecked: run.pagesChecked,
        phonesFound: run.phonesFound,
        uniquePhones: run.uniquePhones,
        error: run.error,
      };
    }
    if (['queued', 'running'].includes(run.status)) {
      hasActiveRuns = true;
    }
  }

  const summaries: Record<number, unknown> = {};
  for (const event of repos.audit.list()) {
    if (event.action === 'run.bina.summary' && event.entityType === 'run') {
      summaries[event.entityId] = event.details;
    }
  }

  const binaStatsMap: Record<number, { totalDiscovered: number; professionalCount: number }> = {};
  for (const source of rows) {
    if (source.type === 'bina_agency' && repos.binaListings) {
      const stats = repos.binaListings.stats(source.id);
      if (stats) {
        binaStatsMap[source.id] = {
          totalDiscovered: stats.totalDiscovered,
          professionalCount: stats.professionalCount,
        };
      }
    }
  }

  const sourcesData: SourceRowData[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    locator: r.locator,
    language: r.language,
    maxPages: r.maxPages,
    maxDepth: r.maxDepth,
    delayMs: r.delayMs,
    enabled: r.enabled,
    killSwitch: r.killSwitch,
  }));

  return (
    <>
      <AutoRefresh hasActiveRuns={hasActiveRuns} />
      <p className="eyebrow">{t(lang, 'sources.eyebrow')}</p>
      <h1>{t(lang, 'sources.title')}</h1>
      <div className="stack">
        <SourceForm lang={lang} />
        <SourcesTable
          lang={lang}
          sources={sourcesData}
          latestRuns={latestRuns}
          summaries={summaries}
          binaStatsMap={binaStatsMap}
          cycleHours={cycleHours}
          continuous={continuous}
        />
      </div>
    </>
  );
}
