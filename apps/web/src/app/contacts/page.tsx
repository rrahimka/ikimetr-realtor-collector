import { getRepositories } from '../../lib/db';import { getLang } from '../../lib/lang';import { t, tEnum } from '../../lib/i18n';import { ContactsImport } from '../../components/contacts-import';
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
    <a href="/api/contacts/export"><button>{t(lang,'contacts.csvExport')}</button></a></div>
  <div className="table-wrap"><table><thead><tr><th>{t(lang,'contacts.colContact')}</th><th>{t(lang,'contacts.colNumber')}</th><th>{t(lang,'contacts.colClass')}</th><th>{t(lang,'contacts.colPlatform')}</th><th>{t(lang,'contacts.colVerification')}</th><th>{t(lang,'contacts.colFound')}</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><a href={`/contacts/${c.id}`}>{c.name??'—'}</a><br/><span className="muted">{c.agency??c.username??'—'}</span></td><td>{c.originalPhone}<br/><strong>{c.normalizedPhone}</strong>{c.isForeign&&<span className="badge">{t(lang,'contacts.foreign')}</span>}</td><td>{tEnum(lang,'type',c.type)}<br/><span className="muted">{Math.round(c.confidence*100)}% · {c.reasons.join(', ')}</span></td><td>{c.platform??'—'}</td><td>{tEnum(lang,'status',c.verificationStatus)}</td><td>{c.firstSeenAt}<br/><span className="muted">{c.lastSeenAt}</span></td></tr>)}</tbody></table></div>
  {rows.length===0&&<p className="muted">{t(lang,'contacts.empty')}</p>}
  <ContactsImport lang={lang}/></>;
}
