import { getRepositories } from '../lib/db';
import { getLang } from '../lib/lang';
import { t, type Lang } from '../lib/i18n';
import { AutoRefresh } from '../components/auto-refresh';
import { QuickRunPanel } from '../components/quick-run-panel';

export const dynamic = 'force-dynamic';

function formatBakuTodayHeading(lang: Lang, date = new Date()): string {
  const locale = lang === 'az' ? 'az-AZ' : lang === 'en' ? 'en-GB' : 'ru-RU';
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Baku',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  if (lang === 'az') return `Bu gün, ${formatted}`;
  if (lang === 'en') return `Today, ${formatted}`;
  return `Сегодня, ${formatted}`;
}

export default async function Dashboard() {
  const lang = await getLang();
  const repos = getRepositories();
  const s = repos.dashboard.stats();
  const todayHeading = formatBakuTodayHeading(lang);

  return (
    <>
      <AutoRefresh hasActiveRuns={s.active > 0} />
      <p className="eyebrow">{t(lang, 'dashboard.eyebrow')}</p>
      <h1>{t(lang, 'dashboard.title')}</h1>

      {/* Main Totals & Overview Cards */}
      <section className="cards">
        {/* Card 1: Unique Realtors */}
        <article className="card">
          <span className="muted">{t(lang, 'dashboard.contacts')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong>{s.contacts}</strong>
            <span className="badge badge-success" style={{ fontSize: '12px' }}>
              {t(lang, 'dashboard.todayDelta', { count: s.newContactsToday })}
            </span>
          </div>
          {s.newContactsLastRun > 0 && (
            <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
              {t(lang, 'dashboard.lastRun', { count: s.newContactsLastRun })}
            </div>
          )}
        </article>

        {/* Card 2: New Contacts Today */}
        <article className="card">
          <span className="muted">{t(lang, 'dashboard.new')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--success)' }}>+{s.newContactsToday}</strong>
          </div>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {s.newContactsLastRun > 0
              ? t(lang, 'dashboard.lastRun', { count: s.newContactsLastRun })
              : 'За текущие сутки'}
          </div>
        </article>

        {/* Card 3: Leads */}
        <article className="card">
          <span className="muted">{t(lang, 'dashboard.leads')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong>{s.leads}</strong>
            <span className="badge badge-info" style={{ fontSize: '12px' }}>
              {t(lang, 'dashboard.todayDelta', { count: s.newLeadsToday })}
            </span>
          </div>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {s.activeLeads} {t(lang, 'dashboard.activeLeads').toLowerCase()}
          </div>
        </article>

        {/* Card 4: Runs */}
        <article className="card">
          <span className="muted">{t(lang, 'dashboard.runs')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong>{s.runs}</strong>
            <span className="badge badge-info" style={{ fontSize: '12px' }}>
              {t(lang, 'dashboard.todayDelta', { count: s.runsToday })}
            </span>
          </div>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {s.successfulRunsToday} успешно · {s.failedRunsToday} ошибок
          </div>
        </article>

        {/* Card 5: Errors Today */}
        <article className="card">
          <span className="muted">{t(lang, 'dashboard.errors')}</span>
          <strong>{s.errorsToday}</strong>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {t(lang, 'dashboard.errorsHistory', { count: s.errors })}
          </div>
        </article>

        {/* Card 6: Sources */}
        <article className="card">
          <span className="muted">{t(lang, 'dashboard.sources')}</span>
          <strong>{s.sources}</strong>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {s.active} {t(lang, 'dashboard.active').toLowerCase()}
          </div>
        </article>
      </section>

      {/* Origins Breakdown & Review Queue Alert Cards */}
      <section className="cards" style={{ marginTop: '16px' }}>
        <article className="card">
          <span className="muted">{t(lang, 'contacts.tabWebsites')}</span>
          <strong style={{ color: '#1d4ed8' }}>{s.websiteContacts ?? 0}</strong>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {t(lang, 'badge.website')}
          </div>
        </article>

        <article className="card">
          <span className="muted">{t(lang, 'contacts.tabSocial')}</span>
          <strong style={{ color: '#be185d' }}>{s.socialContacts ?? 0}</strong>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {t(lang, 'badge.social')}
          </div>
        </article>

        <article className="card">
          <span className="muted">{t(lang, 'contacts.tabWhatsApp')}</span>
          <strong style={{ color: '#15803d' }}>{s.whatsappContacts ?? 0}</strong>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {t(lang, 'badge.whatsapp')}
          </div>
        </article>

        <article className="card">
          <span className="muted">{t(lang, 'review.title')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <strong style={{ color: (s.unreviewedContacts ?? 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {s.unreviewedContacts ?? 0}
            </strong>
          </div>
          <div className="muted" style={{ marginTop: '4px', fontSize: '11px' }}>
            {(s.unreviewedContacts ?? 0) > 0 ? (
              <a href="/review" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {t(lang, 'review.subtitle')} →
              </a>
            ) : (
              'Все кандидаты проверены'
            )}
          </div>
        </article>
      </section>

      {/* Today Section */}
      <section className="panel" style={{ marginTop: '24px' }}>
        <div style={{ marginBottom: '16px' }}>
          <p className="eyebrow">{t(lang, 'dashboard.todaySection')}</p>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700 }}>
            {todayHeading}
          </h2>
          <div className="muted">{t(lang, 'dashboard.todaySubtitle')}</div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
          }}
        >
          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.newRealtorsToday')}</span>
            <strong style={{ color: 'var(--success)' }}>+{s.newContactsToday}</strong>
          </div>

          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.newLeadsToday')}</span>
            <strong style={{ color: 'var(--info)' }}>+{s.newLeadsToday}</strong>
          </div>

          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.enrichedToday')}</span>
            <strong style={{ color: 'var(--accent)' }}>+{s.enrichedContactsToday}</strong>
          </div>

          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.evidenceToday')}</span>
            <strong>+{s.evidenceToday}</strong>
          </div>

          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.runsToday')}</span>
            <strong>{s.runsToday}</strong>
          </div>

          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.successfulToday')}</span>
            <strong style={{ color: 'var(--success)' }}>{s.successfulRunsToday}</strong>
          </div>

          <div className="card" style={{ background: 'var(--panel-subtle)' }}>
            <span className="muted">{t(lang, 'dashboard.errors')}</span>
            <strong style={{ color: s.errorsToday > 0 ? 'var(--danger)' : 'inherit' }}>
              {s.errorsToday}
            </strong>
          </div>
        </div>
      </section>

      {/* Quick Run Bulk Controls */}
      <QuickRunPanel lang={lang} activeRunsCount={s.active} />
    </>
  );
}
