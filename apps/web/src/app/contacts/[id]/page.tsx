import { notFound } from 'next/navigation';import { getRepositories } from '../../../lib/db';import { getLang } from '../../../lib/lang';import { formatDateTime, t, tEnum, tReason } from '../../../lib/i18n';
export const dynamic='force-dynamic';
type EvidenceRow={id:number;source_id:number;source_url:string;location_type:string;excerpt:string;raw_phone:string;platform:string;fingerprint:string;discovered_at:string};
export default async function ContactDetail({params}:{params:Promise<{id:string}>}){
  const lang=await getLang();
  const {id}=await params;
  const contact=getRepositories().contacts.get(Number(id));
  if(!contact)notFound();
  const evidence=getRepositories().contacts.evidenceFor(contact.normalizedPhone) as EvidenceRow[];
  return <><p className="eyebrow">{t(lang,'detail.eyebrow')}</p><h1>{contact.name??contact.normalizedPhone}</h1>
  <section className="cards">
    <article className="card"><span className="muted">{t(lang,'detail.number')}</span><strong>{contact.normalizedPhone}</strong><span className="muted">{contact.originalPhone}</span></article>
    <article className="card"><span className="muted">{t(lang,'detail.class')}</span><strong>{tEnum(lang,'type',contact.type)}</strong><span className="muted">{Math.round(contact.confidence*100)}% · {contact.reasons.map(reason=>tReason(lang,reason)).join(', ')}</span></article>
    <article className="card"><span className="muted">{t(lang,'detail.platform')}</span><strong>{contact.platform??'—'}</strong><span className="muted">{t(lang,'detail.status')}: {tEnum(lang,'status',contact.verificationStatus)}</span></article>
    <article className="card"><span className="muted">{t(lang,'detail.found')}</span><strong>{formatDateTime(lang,contact.firstSeenAt)}</strong><span className="muted">{t(lang,'detail.updated')}: {formatDateTime(lang,contact.lastSeenAt)}</span></article>
  </section>
  <h2>{t(lang,'detail.evidence')}</h2>
  {evidence.length===0?<p className="muted">{t(lang,'detail.evidenceEmpty')}</p>:
  <div className="table-wrap"><table><thead><tr><th>{t(lang,'detail.colSource')}</th><th>{t(lang,'detail.colType')}</th><th>{t(lang,'detail.colText')}</th><th>{t(lang,'detail.colPlatform')}</th><th>{t(lang,'detail.colDate')}</th></tr></thead><tbody>{evidence.map(e=><tr key={e.id}><td>{e.source_url.startsWith('http')?<a href={e.source_url} target="_blank" rel="noreferrer">{e.source_url}</a>:e.source_url}</td><td>{e.location_type}</td><td>{e.excerpt}</td><td>{e.platform}</td><td>{formatDateTime(lang,e.discovered_at)}</td></tr>)}</tbody></table></div>}
  <p><a href="/contacts">{t(lang,'common.back')}</a></p></>;
}
