import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getRepositories } from '../../../lib/db';
import { getLang } from '../../../lib/lang';
import { formatDateTime, t } from '../../../lib/i18n';
import { toWhatsAppDirectLink, isEligibleWhatsAppMobile } from '../../../lib/export';
import type { LeadStatus } from '@ikimetr/core';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const lang = await getLang();
  const { id } = await params;
  const leadId = Number(id);

  if (Number.isNaN(leadId)) notFound();

  const repos = getRepositories();
  const lead = repos.leads.get(leadId);
  if (!lead) notFound();

  const hasMobile = lead.normalizedPhone ? isEligibleWhatsAppMobile(lead.normalizedPhone) : false;
  const waUrl = hasMobile && lead.normalizedPhone ? toWhatsAppDirectLink(lead.normalizedPhone) : null;

  async function updateStatusAction(formData: FormData) {
    'use server';
    await Promise.resolve();
    const nextStatus = formData.get('status') as LeadStatus;
    if (nextStatus) {
      const r = getRepositories();
      r.leads.updateStatus(leadId, nextStatus);
      redirect(`/leads/${leadId}`);
    }
  }

  return (
    <>
      <p>
        <Link href="/leads" className="muted" style={{ textDecoration: 'none' }}>
          {t(lang, 'common.back')}
        </Link>
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>
          {lead.leadType.toUpperCase()} LEAD #{lead.id}
        </h1>
        <span className="badge badge-success" style={{ fontSize: '1rem', fontWeight: 'bold' }}>
          {lead.status.toUpperCase()}
        </span>
        {lead.isRealtorSender && (
          <span className="badge" style={{ fontSize: '0.85rem' }}>
            Sender: Known Realtor
          </span>
        )}
      </div>

      <div className="grid grid-2" style={{ gap: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Left Panel: Contact & Structured Criteria */}
        <div className="panel" style={{ padding: '1.5rem' }}>
          <h3>Контакт и требования</h3>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Имя / Юзернейм</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '2px' }}>
              {lead.username ? `@${lead.username.replace(/^@/, '')}` : (lead.displayName || '—')}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Публичный телефон</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '2px' }}>
              {lead.normalizedPhone || lead.publicPhone || 'Не опубликован'}
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: '10px', color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem' }}
                >
                  [Открыть WhatsApp]
                </a>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Локация (Район / Метро / Город)</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '2px' }}>
              {lead.district || lead.city || 'Bakı'}
              {lead.metro && ` (m. ${lead.metro})`}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Тип недвижимости и комнаты</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '2px' }}>
              {lead.propertyType || 'Любой'} {lead.rooms ? `· ${lead.rooms} комн.` : ''}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Бюджет</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981', marginTop: '2px' }}>
              {lead.budgetMax || lead.budgetMin ? (
                <span>
                  {lead.budgetMin ? `${lead.budgetMin.toLocaleString()} – ` : 'до '}
                  {lead.budgetMax?.toLocaleString()} {lead.currency}
                </span>
              ) : (
                'Не указан'
              )}
            </div>
          </div>

          {/* Status Updater */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Изменить статус лида:</div>
            <form action={updateStatusAction} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select name="status" defaultValue={lead.status} style={{ flex: 1 }}>
                <option value="new">Новый (New)</option>
                <option value="qualified">Квалифицирован (Qualified)</option>
                <option value="needs_review">На проверке (Needs Review)</option>
                <option value="contacted">Связались (Contacted)</option>
                <option value="converted">Сделка (Converted)</option>
                <option value="rejected">Отклонён (Rejected)</option>
                <option value="expired">Истёк (Expired)</option>
              </select>
              <button type="submit">Сохранить</button>
            </form>
          </div>
        </div>

        {/* Right Panel: Source Evidence & Intent Excerpt */}
        <div className="panel" style={{ padding: '1.5rem' }}>
          <h3>Источник и распознанный текст</h3>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Платформа и поверхность поиска</div>
            <div style={{ fontSize: '1rem', marginTop: '2px' }}>
              <strong>{lead.sourcePlatform}</strong> · <code>{lead.sourceSurface}</code>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Ссылка на сообщение / пост</div>
            <div style={{ marginTop: '2px', wordBreak: 'break-all' }}>
              <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
                {lead.sourceUrl}
              </a>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Текст намерения (Excerpt)</div>
            <div
              style={{
                marginTop: '4px',
                padding: '0.75rem',
                backgroundColor: 'var(--surface-subtle, #f3f4f6)',
                borderRadius: '6px',
                fontSize: '0.95rem',
                lineHeight: '1.4',
              }}
            >
              &ldquo;{lead.intentExcerpt}&rdquo;
            </div>
          </div>

          {lead.parentContext && (
            <div style={{ marginTop: '1rem' }}>
              <div className="muted" style={{ fontSize: '0.85rem' }}>Контекст родительского поста / темы</div>
              <div
                style={{
                  marginTop: '4px',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--surface-subtle, #f3f4f6)',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted, #6b7280)',
                }}
              >
                {lead.parentContext}
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>Сигналы уверенности ({(lead.confidence * 100).toFixed(0)}%)</div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
              {lead.signals.map((sig, i) => (
                <span key={i} className="badge" style={{ fontSize: '0.75rem' }}>
                  {sig}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Обнаружен: {formatDateTime(lang, lead.firstSeenAt)} | Обновлён: {formatDateTime(lang, lead.lastSeenAt)}
          </div>
        </div>
      </div>
    </>
  );
}
