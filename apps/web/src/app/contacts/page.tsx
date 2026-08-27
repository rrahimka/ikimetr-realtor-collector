import { getRepositories } from '../../lib/db';import { getLang } from '../../lib/lang';import { formatDateTime, t, tEnum, tReason } from '../../lib/i18n';import { ContactsImport } from '../../components/contacts-import';
export const dynamic='force-dynamic';
export default async function Contacts({searchParams}:{searchParams:Promise<{q?:string;type?:string;platform?:string;status?:string;foreign?:string}>}){
  const lang=await getLang();
  const {q='',type='',platform='',status='',foreign=''}=await searchParams;
  const filters={type:type||undefined,platform:platform||undefined,verificationStatus:status||undefined,isForeign:foreign===''?undefined:foreign==='true'};
  const rows=getRepositories().contacts.list(q,filters);
  return <><p className="eyebrow">{t(lang,'contacts.eyebrow')}</p><h1>{t(lang,'contacts.title')}</h1>
  <div className="toolbar panel"><form>
    <input name="q" defaultValue={q} placeholder={t(lang,'contacts.searchPlaceholder')}/>
    <select name="type" defaultValue={type}><option value="">{t(lang,'contacts.typeAll')}</option>{['agent','agency','owner','unknown','suspicious'].map(x=><option key={x} value={x}>{tEnum(lang,'type',x)}</option>)}</select>
    <select name="status" defaultValue={status}><option value="">{t(lang,'contacts.statusAll')}</option>{['unreviewed','verified','rejected'].map(x=><option key={x} value={x}>{tEnum(lang,'status',x)}</option>)}</select>
    <select name="foreign" defaultValue={foreign}><option value="">{t(lang,'contacts.originAll')}</option><option value="false">{t(lang,'contacts.originAz')}</option><option value="true">{t(lang,'contacts.originForeign')}</option></select>
    <button>{t(lang,'common.search')}</button></form>
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <a href="/api/contacts/export" download="contacts.csv"><button title="Export CSV format">{t(lang,'contacts.csvExport')}</button></a>
      <a href="/api/contacts/export?format=xlsx" download="azerbaijan-realtors.xlsx"><button className="btn-secondary" title="Export Excel format">{t(lang,'contacts.exportExcel')}</button></a>
      <a href="/api/contacts/export?format=phones" download="phones.txt"><button className="btn-secondary" title="Export phone numbers list">{t(lang,'contacts.exportPhones')}</button></a>
      <a href="/api/contacts/export?format=whatsapp" download="whatsapp-links.txt"><button className="btn-secondary" title="Export WhatsApp direct links">{t(lang,'contacts.exportWhatsApp')}</button></a>
    </div></div>
  <div className="table-wrap"><table><thead><tr><th>{t(lang,'contacts.colContact')}</th><th>{t(lang,'contacts.colNumber')}</th><th>{t(lang,'contacts.colClass')}</th><th>{t(lang,'contacts.colPlatform')}</th><th>{t(lang,'contacts.colVerification')}</th><th>{t(lang,'contacts.colFound')}</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><a href={`/contacts/${c.id}`}>{c.name??'—'}</a><br/><span className="muted">{c.agency??c.username??'—'}</span></td><td>{c.originalPhone}<br/><strong>{c.normalizedPhone}</strong>{c.isForeign&&<span className="badge">{t(lang,'contacts.foreign')}</span>}</td><td>{tEnum(lang,'type',c.type)}<br/><span className="muted">{Math.round(c.confidence*100)}% · {c.reasons.map(reason=>tReason(lang,reason)).join(', ')}</span></td><td>{c.platform??'—'}</td><td>{tEnum(lang,'status',c.verificationStatus)}</td><td>{formatDateTime(lang,c.firstSeenAt)}<br/><span className="muted">{formatDateTime(lang,c.lastSeenAt)}</span></td></tr>)}</tbody></table></div>
  {rows.length===0&&<p className="muted">{t(lang,'contacts.empty')}</p>}
  <ContactsImport lang={lang}/></>;
}
