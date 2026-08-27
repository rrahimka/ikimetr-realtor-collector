import Link from 'next/link';
import { getRepositories } from '../../lib/db';
import { getLang } from '../../lib/lang';
import { formatDateTime, t } from '../../lib/i18n';
import { toWhatsAppDirectLink, isEligibleWhatsAppMobile } from '../../lib/export';
import { getSafeSourceUrl, getLeadSourceTooltip, formatPlatformDisplay } from '@ikimetr/core';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    leadType?: string;
    status?: string;
    confidenceLevel?: string;
    platform?: string;
  }>;
}) {
  const lang = await getLang();
  const { q = '', leadType = '', status = '', confidenceLevel = '', platform = '' } = await searchParams;

  const repos = getRepositories();
  const leads = repos.leads.list({
    search: q || undefined,
    leadType: leadType || undefined,
    status: status || undefined,
    confidenceLevel: confidenceLevel || undefined,
    sourcePlatform: platform || undefined,
  });

  const stats = repos.leads.stats();

  // Export query string matching current filters
  const exportParams = new URLSearchParams();
  if (leadType) exportParams.set('leadType', leadType);
  if (status) exportParams.set('status', status);
  if (confidenceLevel) exportParams.set('confidenceLevel', confidenceLevel);
  if (platform) exportParams.set('sourcePlatform', platform);
  const exportQuery = exportParams.toString() ? `?${exportParams.toString()}` : '';
  const xlsxExportUrl = `/api/leads/export?format=xlsx${exportQuery ? `&${exportParams.toString()}` : ''}`;
  const csvExportUrl = `/api/leads/export?format=csv${exportQuery ? `&${exportParams.toString()}` : ''}`;

  const getIntentBadgeColor = (type: string) => {
    switch (type) {
      case 'buyer':
        return 'badge-success';
      case 'seller':
        return 'badge-info';
      case 'renter':
        return 'badge-purple';
      case 'landlord':
        return 'badge-warning';
      case 'investor':
        return 'badge-amber';
      case 'realtor_request':
        return 'badge-neutral';
      default:
        return 'badge-default';
    }
  };

  return (
    <>
      <p className="eyebrow">{t(lang, 'leads.eyebrow')}</p>
      <h1>{t(lang, 'leads.title')}</h1>

      {/* Stats Overview */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem', gap: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Активные лиды</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.active}</div>
        </div>
        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Покупатели (Buyers)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{stats.buyers}</div>
        </div>
        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Продавцы (Sellers)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.sellers}</div>
        </div>
        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Аренда (Rent/Lease)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{stats.renters + stats.landlords}</div>
        </div>
        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Высокая точность</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.highConfidence}</div>
        </div>
        <div className="panel" style={{ padding: '0.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.8rem' }}>Новые за сутки</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.today}</div>
        </div>
      </div>

      {/* Filter & Export Toolbar */}
      <div className="toolbar panel">
        <form style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
          <input name="q" defaultValue={q} placeholder={t(lang, 'leads.searchPlaceholder')} style={{ minWidth: '200px' }} />
          <select name="leadType" defaultValue={leadType}>
            <option value="">{t(lang, 'leads.typeAll')}</option>
            <option value="buyer">Покупатель (Buyer)</option>
            <option value="seller">Продавец (Seller)</option>
            <option value="renter">Арендатор (Renter)</option>
            <option value="landlord">Арендодатель (Landlord)</option>
            <option value="investor">Инвестор (Investor)</option>
            <option value="realtor_request">Запрос риелтора</option>
          </select>
          <select name="status" defaultValue={status}>
            <option value="">{t(lang, 'leads.statusAll')}</option>
            <option value="new">Новый (New)</option>
            <option value="qualified">Квалифицирован (Qualified)</option>
            <option value="needs_review">На проверке (Needs Review)</option>
            <option value="contacted">Связались (Contacted)</option>
            <option value="converted">Сделка (Converted)</option>
            <option value="rejected">Отклонён (Rejected)</option>
            <option value="expired">Истёк (Expired)</option>
          </select>
          <select name="confidenceLevel" defaultValue={confidenceLevel}>
            <option value="">{t(lang, 'leads.confAll')}</option>
            <option value="high">Высокая (High)</option>
            <option value="medium">Средняя (Medium)</option>
            <option value="low">Низкая (Low)</option>
          </select>
          <select name="platform" defaultValue={platform}>
            <option value="">{t(lang, 'leads.platformAll')}</option>
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
            <option value="website">Website</option>
          </select>
          <button type="submit">{t(lang, 'common.search')}</button>
        </form>

        {/* Lead Export Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a href={xlsxExportUrl} download="azerbaijan-real-estate-leads.xlsx">
            <button className="btn-secondary" title="Export Leads to Excel XLSX">
              {t(lang, 'leads.exportExcel')}
            </button>
          </a>
          <a href={csvExportUrl} download="leads.csv">
            <button className="btn-secondary" title="Export Leads to CSV">
              {t(lang, 'leads.exportCsv')}
            </button>
          </a>
        </div>
      </div>

      {/* Leads Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t(lang, 'leads.colIntent')}</th>
              <th>{t(lang, 'leads.colContact')}</th>
              <th>{t(lang, 'leads.colLocation')}</th>
              <th>{t(lang, 'leads.colProperty')}</th>
              <th>{t(lang, 'leads.colBudget')}</th>
              <th>{t(lang, 'leads.colPlatform')}</th>
              <th>{t(lang, 'leads.colConfidence')}</th>
              <th>{t(lang, 'leads.colStatus')}</th>
              <th>{t(lang, 'leads.colFound')}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const hasMobile = l.normalizedPhone ? isEligibleWhatsAppMobile(l.normalizedPhone) : false;
              const waUrl = hasMobile && l.normalizedPhone ? toWhatsAppDirectLink(l.normalizedPhone) : null;
              const safeSourceUrl = getSafeSourceUrl(l.sourceUrl);
              const sourceTooltip = getLeadSourceTooltip(l);
              const platformDisplay = formatPlatformDisplay(l.sourcePlatform);

              return (
                <tr key={l.id}>
                  <td>
                    <Link href={`/leads/${l.id}`}>
                      <span className={`badge ${getIntentBadgeColor(l.leadType)}`} style={{ fontWeight: 'bold' }}>
                        {l.leadType.toUpperCase()}
                      </span>
                    </Link>
                    {l.isRealtorSender && (
                      <span className="badge" style={{ marginLeft: '4px', fontSize: '0.7rem' }}>
                        Агент
                      </span>
                    )}
                  </td>
                  <td>
                    {l.username ? (
                      safeSourceUrl ? (
                        <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer">
                          <strong>@{l.username.replace(/^@/, '')}</strong>
                        </a>
                      ) : (
                        <strong>@{l.username.replace(/^@/, '')}</strong>
                      )
                    ) : (
                      <span>{l.displayName || '—'}</span>
                    )}
                    {l.normalizedPhone && (
                      <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                        <span>{l.normalizedPhone}</span>
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginLeft: '6px', color: '#10b981', fontWeight: 'bold', fontSize: '0.75rem' }}
                            title="Constructed WhatsApp candidate link"
                          >
                            [WA]
                          </a>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <strong>{l.district || l.city || 'Bakı'}</strong>
                    {l.metro && <div className="muted" style={{ fontSize: '0.8rem' }}>m. {l.metro}</div>}
                  </td>
                  <td>
                    {l.propertyType ? (
                      <span>{l.propertyType}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {l.rooms && (
                      <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>
                        ({l.rooms} otaq)
                      </span>
                    )}
                  </td>
                  <td>
                    {l.budgetMax || l.budgetMin ? (
                      <strong>
                        {l.budgetMin ? `${l.budgetMin.toLocaleString()} - ` : 'до '}
                        {l.budgetMax?.toLocaleString()} {l.currency}
                      </strong>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {safeSourceUrl ? (
                      <a
                        href={safeSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={sourceTooltip}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        <strong>{platformDisplay} ↗</strong>
                      </a>
                    ) : (
                      <strong>{platformDisplay}</strong>
                    )}
                    <div className="muted" style={{ fontSize: '0.75rem' }}>{l.sourceSurface}</div>
                  </td>
                  <td>
                    <span className={`badge ${l.confidenceLevel === 'high' ? 'badge-success' : 'badge-default'}`}>
                      {l.confidenceLevel.toUpperCase()} ({(l.confidence * 100).toFixed(0)}%)
                    </span>
                  </td>
                  <td>
                    <span className="badge">{l.status}</span>
                  </td>
                  <td>
                    {formatDateTime(lang, l.firstSeenAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {leads.length === 0 && <p className="muted" style={{ marginTop: '1rem' }}>{t(lang, 'leads.empty')}</p>}
    </>
  );
}
