import Link from 'next/link';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { t, tEnum, tReason } from '../../lib/i18n';
import { ApiButton } from '../../components/api-button';
import type { OriginGroup } from '@ikimetr/core';

export const dynamic = 'force-dynamic';

export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{
    origin?: string;
    tier?: string;
  }>;
}) {
  const lang = await getLang();
  const { origin = '', tier = '' } = await searchParams;
  const repos = getRepositories();

  const originFilter: OriginGroup | undefined = origin === 'website' || origin === 'social' || origin === 'whatsapp' ? origin : undefined;
  const tierFilter: 'gte90' | '70-89' | 'lt70' | undefined = tier === 'gte90' || tier === '70-89' || tier === 'lt70' ? tier : undefined;

  const allPending = repos.reviews.listPending();
  const rows = repos.reviews.listPending({
    ...(originFilter ? { origin: originFilter } : {}),
    ...(tierFilter ? { confidenceTier: tierFilter } : {}),
  });
  const merges = repos.reviews.listMerges();

  const websitePendingCount = allPending.filter((p) => p.originGroups.includes('website') || p.primaryOrigin === 'website').length;
  const socialPendingCount = allPending.filter((p) => p.originGroups.includes('social') || p.primaryOrigin === 'social').length;
  const waPendingCount = allPending.filter((p) => p.originGroups.includes('whatsapp') || p.primaryOrigin === 'whatsapp').length;

  const currentTab = origin || 'all';

  return (
    <>
      <p className="eyebrow">{t(lang, 'review.eyebrow')}</p>
      <h1>{t(lang, 'review.title')}</h1>
      <p className="muted" style={{ marginBottom: '1.25rem' }}>{t(lang, 'review.subtitle')}</p>

      <div className="source-filter-tabs" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link
          href={`/review?${new URLSearchParams({ ...(tier ? { tier } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'all' ? 'active' : ''}`}
        >
          {t(lang, 'review.tabAll')} ({allPending.length})
        </Link>
        <Link
          href={`/review?${new URLSearchParams({ origin: 'website', ...(tier ? { tier } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'website' ? 'active' : ''}`}
        >
          {t(lang, 'review.tabWebsites')} ({websitePendingCount})
        </Link>
        <Link
          href={`/review?${new URLSearchParams({ origin: 'social', ...(tier ? { tier } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'social' ? 'active' : ''}`}
        >
          {t(lang, 'review.tabSocial')} ({socialPendingCount})
        </Link>
        <Link
          href={`/review?${new URLSearchParams({ origin: 'whatsapp', ...(tier ? { tier } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'whatsapp' ? 'active' : ''}`}
        >
          {t(lang, 'review.tabWhatsApp')} ({waPendingCount})
        </Link>
      </div>

      <div className="toolbar panel" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <form style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {origin && <input type="hidden" name="origin" value={origin} />}
          <label style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{t(lang, 'review.colConfidence')}:</label>
          <select name="tier" defaultValue={tier}>
            <option value="">{t(lang, 'review.confAll')}</option>
            <option value="gte90">{t(lang, 'review.confGte90')}</option>
            <option value="70-89">{t(lang, 'review.conf7089')}</option>
            <option value="lt70">{t(lang, 'review.confLt70')}</option>
          </select>
          <button type="submit">{t(lang, 'common.search')}</button>
        </form>
      </div>

      <section className="stack">
        <div className="panel">
          <h2>{t(lang, 'review.doubtful')} ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="muted" style={{ padding: '1rem 0' }}>{t(lang, 'review.noPending')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t(lang, 'review.colContact')}</th>
                    <th>{t(lang, 'review.colNumber')}</th>
                    <th>{t(lang, 'review.colType')}</th>
                    <th>{t(lang, 'review.colConfidence')}</th>
                    <th>{t(lang, 'review.colOrigin')}</th>
                    <th>{t(lang, 'review.colReasons')}</th>
                    <th>{t(lang, 'review.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const confPct = Math.round(c.confidence * 100);
                    const confClass = confPct >= 90 ? 'badge-success' : confPct >= 70 ? 'badge-warning' : 'badge-danger';
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/contacts/${c.id}`}><strong>{c.name || c.agency || c.username || t(lang, 'review.unknown')}</strong></Link>
                          {c.agency && c.name && <><br /><span className="muted">{c.agency}</span></>}
                        </td>
                        <td>
                          <strong>{c.normalizedPhone}</strong>
                          {c.originalPhone && c.originalPhone !== c.normalizedPhone && <><br /><span className="muted">{c.originalPhone}</span></>}
                          {c.isForeign && <span className="badge" style={{ marginLeft: '4px' }}>{t(lang, 'contacts.foreign')}</span>}
                        </td>
                        <td>
                          <span className="badge">{tEnum(lang, 'type', c.type)}</span>
                        </td>
                        <td>
                          <span className={`badge ${confClass}`}>
                            {confPct}%
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '2px' }}>
                            {c.originGroups.map((g) => (
                              <span key={g} className={`badge badge-origin-${g}`}>
                                {t(lang, `badge.${g}`)}
                              </span>
                            ))}
                          </div>
                          {c.platform && <span className="muted" style={{ fontSize: '0.8rem' }}>{c.platform}</span>}
                        </td>
                        <td style={{ maxWidth: '280px' }}>
                          <span className="muted" style={{ fontSize: '0.85rem' }}>
                            {c.signals && c.signals.length > 0
                              ? c.signals.map((s) => s.label).join(', ')
                              : c.reasons.map((r) => tReason(lang, r)).join(', ') || t(lang, 'review.noSignals')}
                          </span>
                          {c.evidenceUrl && c.evidenceUrl.startsWith('http') && (
                            <div style={{ marginTop: '4px' }}>
                              <a
                                href={c.evidenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="external-source-link"
                                style={{ fontSize: '0.8rem' }}
                              >
                                {t(lang, 'review.openSource')}
                              </a>
                            </div>
                          )}
                        </td>
                        <td className="toolbar">
                          <ApiButton
                            url="/api/review/status"
                            body={{ contactId: c.id, status: 'verified' }}
                            label={t(lang, 'review.verify')}
                          />
                          <ApiButton
                            url="/api/review/status"
                            body={{ contactId: c.id, status: 'rejected' }}
                            label={t(lang, 'review.reject')}
                            kind="danger"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>{t(lang, 'review.mergeHistory')}</h2>
          {merges.length === 0 ? (
            <p className="muted">{t(lang, 'review.noMerges')}</p>
          ) : (
            merges.map((m) => (
              <div className="toolbar" key={String(m.id)}>
                <span>#{String(m.source_contact_id)} → #{String(m.target_contact_id)}</span>
                {!m.undone_at && (
                  <ApiButton
                    url="/api/review/undo"
                    body={{ mergeId: m.id, reason: 'manual undo' }}
                    label={t(lang, 'review.undo')}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
