import Link from 'next/link';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { t, tEnum, tReason } from '../../lib/i18n';
import { ContactsImport } from '../../components/contacts-import';
import type { OriginGroup } from '@ikimetr/core';

export const dynamic = 'force-dynamic';

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    origin?: string;
    type?: string;
    status?: string;
    foreign?: string;
  }>;
}) {
  const lang = await getLang();
  const { q = '', origin = '', type = '', status = '', foreign = '' } = await searchParams;
  const repos = getRepositories();

  const originFilter: OriginGroup | undefined = origin === 'website' || origin === 'social' || origin === 'whatsapp' ? origin : undefined;
  const filters = {
    origin: originFilter,
    type: type || undefined,
    verificationStatus: status || undefined,
    isForeign: foreign === '' ? undefined : foreign === 'true',
  };

  const rows = repos.contacts.list(q, filters);
  const counts = repos.contacts.originCounts();

  const currentTab = origin || 'all';

  return (
    <>
      <p className="eyebrow">{t(lang, 'contacts.eyebrow')}</p>
      <h1>{t(lang, 'contacts.title')}</h1>

      <div className="source-filter-tabs" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <Link
          href={`/contacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}), ...(foreign ? { foreign } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'all' ? 'active' : ''}`}
        >
          {t(lang, 'contacts.tabAll')} ({counts.total})
        </Link>
        <Link
          href={`/contacts?${new URLSearchParams({ origin: 'website', ...(q ? { q } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}), ...(foreign ? { foreign } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'website' ? 'active' : ''}`}
        >
          {t(lang, 'contacts.tabWebsites')} ({counts.website})
        </Link>
        <Link
          href={`/contacts?${new URLSearchParams({ origin: 'social', ...(q ? { q } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}), ...(foreign ? { foreign } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'social' ? 'active' : ''}`}
        >
          {t(lang, 'contacts.tabSocial')} ({counts.social})
        </Link>
        <Link
          href={`/contacts?${new URLSearchParams({ origin: 'whatsapp', ...(q ? { q } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}), ...(foreign ? { foreign } : {}) }).toString()}`}
          className={`tab-btn ${currentTab === 'whatsapp' ? 'active' : ''}`}
        >
          {t(lang, 'contacts.tabWhatsApp')} ({counts.whatsapp})
        </Link>
      </div>

      <div className="toolbar panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <form style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {origin && <input type="hidden" name="origin" value={origin} />}
          <input name="q" defaultValue={q} placeholder={t(lang, 'contacts.searchPlaceholder')} style={{ minWidth: '220px' }} />
          <select name="type" defaultValue={type}>
            <option value="">{t(lang, 'contacts.typeAll')}</option>
            <option value="agent">{t(lang, 'contacts.typeAgent')}</option>
            <option value="agency">{t(lang, 'contacts.typeAgency')}</option>
            <option value="unknown">{t(lang, 'contacts.typeUnknown')}</option>
          </select>
          <select name="status" defaultValue={status}>
            <option value="">{t(lang, 'contacts.statusAll')}</option>
            <option value="verified">{t(lang, 'contacts.statusVerified')}</option>
            <option value="unreviewed">{t(lang, 'contacts.statusUnreviewed')}</option>
          </select>
          <select name="foreign" defaultValue={foreign}>
            <option value="">{t(lang, 'contacts.originAll')}</option>
            <option value="false">{t(lang, 'contacts.originAz')}</option>
            <option value="true">{t(lang, 'contacts.originForeign')}</option>
          </select>
          <button type="submit">{t(lang, 'common.search')}</button>
        </form>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          <a href={`/api/contacts/export?${new URLSearchParams({ ...(origin ? { origin } : {}) }).toString()}`} download="contacts.csv">
            <button type="button" title="Export CSV format">{t(lang, 'contacts.csvExport')}</button>
          </a>
          <a href={`/api/contacts/export?format=xlsx&${new URLSearchParams({ ...(origin ? { origin } : {}) }).toString()}`} download="azerbaijan-realtors.xlsx">
            <button type="button" className="btn-secondary" title="Export Excel format">{t(lang, 'contacts.exportExcel')}</button>
          </a>
          <a href={`/api/contacts/export?format=phones&${new URLSearchParams({ ...(origin ? { origin } : {}) }).toString()}`} download="phones.txt">
            <button type="button" className="btn-secondary" title="Export phone numbers list">{t(lang, 'contacts.exportPhones')}</button>
          </a>
          <a href={`/api/contacts/export?format=whatsapp&${new URLSearchParams({ ...(origin ? { origin } : {}) }).toString()}`} download="whatsapp-links.txt">
            <button type="button" className="btn-secondary" title="Export WhatsApp direct links">{t(lang, 'contacts.exportWhatsApp')}</button>
          </a>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t(lang, 'contacts.colContact')}</th>
              <th>{t(lang, 'contacts.colNumber')}</th>
              <th>{t(lang, 'contacts.colType')}</th>
              <th>{t(lang, 'contacts.colOrigin')}</th>
              <th>{t(lang, 'contacts.colConfidence')}</th>
              <th>{t(lang, 'contacts.colVerification')}</th>
              <th>{t(lang, 'contacts.colEvidenceCount')}</th>
              <th>{t(lang, 'contacts.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const confPct = Math.round(c.confidence * 100);
              const confClass = confPct >= 90 ? 'badge-success' : confPct >= 70 ? 'badge-warning' : 'badge-danger';
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contacts/${c.id}`}><strong>{c.name || c.agency || c.username || '—'}</strong></Link>
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
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {c.originGroups.map((g) => (
                        <span key={g} className={`badge badge-origin-${g}`}>
                          {t(lang, `badge.${g}`)}
                        </span>
                      ))}
                    </div>
                    {c.platform && <span className="muted" style={{ fontSize: '0.8rem' }}>{c.platform}</span>}
                  </td>
                  <td>
                    <span className={`badge ${confClass}`}>
                      {confPct}%
                    </span>
                    {c.reasons.length > 0 && (
                      <><br /><span className="muted" style={{ fontSize: '0.8rem' }}>{c.reasons.map((reason) => tReason(lang, reason)).join(', ')}</span></>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${c.verificationStatus === 'verified' ? 'badge-success' : 'badge-warning'}`}>
                      {tEnum(lang, 'status', c.verificationStatus)}
                    </span>
                  </td>
                  <td>
                    <span className="badge">{c.evidenceCount}</span>
                  </td>
                  <td>
                    <Link href={`/contacts/${c.id}`} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', textDecoration: 'none', display: 'inline-block' }}>
                      {t(lang, 'contacts.viewDetail')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <p className="muted">{t(lang, 'contacts.empty')}</p>}
      <ContactsImport lang={lang} />
    </>
  );
}
