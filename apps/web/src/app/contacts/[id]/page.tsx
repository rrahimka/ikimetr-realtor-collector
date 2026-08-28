import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRepositories } from '../../../lib/db';
import { getLang } from '../../../lib/lang';
import { formatDateTime, t, tEnum, tReason } from '../../../lib/i18n';
import { ApiButton } from '../../../components/api-button';

export const dynamic = 'force-dynamic';

type EvidenceRow = {
  id: number;
  source_id: number;
  source_url: string;
  location_type: string;
  excerpt: string;
  raw_phone: string;
  platform: string;
  fingerprint: string;
  discovered_at: string;
};

export default async function ContactDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const lang = await getLang();
  const { id } = await params;
  const repos = getRepositories();
  const contact = repos.contacts.get(Number(id));
  if (!contact) notFound();

  const evidence = repos.contacts.evidenceFor(contact.normalizedPhone) as EvidenceRow[];
  const confPct = Math.round(contact.confidence * 100);
  const confClass = confPct >= 90 ? 'badge-success' : confPct >= 70 ? 'badge-warning' : 'badge-danger';

  return (
    <>
      <p className="eyebrow">{t(lang, 'detail.eyebrow')}</p>
      <h1>{contact.name || contact.agency || contact.normalizedPhone}</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`badge ${confClass}`} style={{ fontSize: '1rem', padding: '0.25rem 0.5rem' }}>
          {confPct}% {t(lang, 'contacts.colConfidence')}
        </span>
        <span className={`badge ${contact.verificationStatus === 'verified' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '1rem', padding: '0.25rem 0.5rem' }}>
          {tEnum(lang, 'status', contact.verificationStatus)}
        </span>
        <span className="badge" style={{ fontSize: '1rem', padding: '0.25rem 0.5rem' }}>
          {tEnum(lang, 'type', contact.type)}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {contact.originGroups.map((g) => (
            <span key={g} className={`badge badge-origin-${g}`} style={{ fontSize: '0.9rem', padding: '0.25rem 0.5rem' }}>
              {t(lang, `badge.${g}`)}
            </span>
          ))}
        </div>
      </div>

      <section className="cards">
        <article className="card">
          <span className="muted">{t(lang, 'detail.number')}</span>
          <strong>{contact.normalizedPhone}</strong>
          {contact.originalPhone && contact.originalPhone !== contact.normalizedPhone && (
            <span className="muted">{contact.originalPhone}</span>
          )}
        </article>
        <article className="card">
          <span className="muted">{t(lang, 'detail.class')}</span>
          <strong>{tEnum(lang, 'type', contact.type)}</strong>
          <span className="muted">{confPct}% · {contact.reasons.map((r) => tReason(lang, r)).join(', ') || '—'}</span>
        </article>
        <article className="card">
          <span className="muted">{t(lang, 'detail.platform')}</span>
          <strong>{contact.platform || '—'}</strong>
          <span className="muted">{t(lang, 'detail.status')}: {tEnum(lang, 'status', contact.verificationStatus)}</span>
        </article>
        <article className="card">
          <span className="muted">{t(lang, 'detail.found')}</span>
          <strong>{formatDateTime(lang, contact.firstSeenAt)}</strong>
          <span className="muted">{t(lang, 'detail.updated')}: {formatDateTime(lang, contact.lastSeenAt)}</span>
        </article>
      </section>

      {contact.signals && contact.signals.length > 0 && (
        <section className="panel" style={{ marginTop: '1.5rem' }}>
          <h2>{t(lang, 'detail.scoreExplain')}</h2>
          <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', lineHeight: '1.6' }}>
            {contact.signals.map((sig) => (
              <li key={sig.key}>
                <strong>{sig.points > 0 ? `+${sig.points}` : sig.points}</strong> — {sig.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {contact.verificationStatus === 'unreviewed' && (
        <div className="toolbar panel" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          <ApiButton
            url="/api/review/status"
            body={{ contactId: contact.id, status: 'verified' }}
            label={t(lang, 'review.confirm')}
          />
          <ApiButton
            url="/api/review/status"
            body={{ contactId: contact.id, status: 'rejected' }}
            label={t(lang, 'review.reject')}
            kind="danger"
          />
        </div>
      )}

      <h2 style={{ marginTop: '2rem' }}>{t(lang, 'detail.evidence')} ({evidence.length})</h2>
      {evidence.length === 0 ? (
        <p className="muted">{t(lang, 'detail.evidenceEmpty')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t(lang, 'detail.colSource')}</th>
                <th>{t(lang, 'detail.colType')}</th>
                <th>{t(lang, 'detail.colText')}</th>
                <th>{t(lang, 'detail.colPlatform')}</th>
                <th>{t(lang, 'detail.colDate')}</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.source_url.startsWith('http') ? (
                      <a href={e.source_url} target="_blank" rel="noopener noreferrer">
                        {e.source_url}
                      </a>
                    ) : (
                      e.source_url
                    )}
                  </td>
                  <td><span className="badge">{e.location_type}</span></td>
                  <td>{e.excerpt}</td>
                  <td>{e.platform}</td>
                  <td>{formatDateTime(lang, e.discovered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/contacts">{t(lang, 'common.back')}</Link>
      </p>
    </>
  );
}
