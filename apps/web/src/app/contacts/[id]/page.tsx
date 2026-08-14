import { notFound } from 'next/navigation';
import { getRepositories } from '../../../lib/db';
export const dynamic='force-dynamic';
type EvidenceRow={id:number;source_id:number;source_url:string;location_type:string;excerpt:string;raw_phone:string;platform:string;fingerprint:string;discovered_at:string};
export default async function ContactDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const contact=getRepositories().contacts.get(Number(id));
  if(!contact)notFound();
  const evidence=getRepositories().contacts.evidenceFor(contact.normalizedPhone) as EvidenceRow[];
  return <><p className="eyebrow">Contact</p><h1>{contact.name??contact.normalizedPhone}</h1>
  <section className="cards">
    <article className="card"><span className="muted">Номер</span><strong>{contact.normalizedPhone}</strong><span className="muted">{contact.originalPhone}</span></article>
    <article className="card"><span className="muted">Класс</span><strong>{contact.type}</strong><span className="muted">{Math.round(contact.confidence*100)}% · {contact.reasons.join(', ')}</span></article>
    <article className="card"><span className="muted">Платформа</span><strong>{contact.platform??'—'}</strong><span className="muted">статус: {contact.verificationStatus}</span></article>
    <article className="card"><span className="muted">Обнаружен</span><strong>{contact.firstSeenAt}</strong><span className="muted">обновлён: {contact.lastSeenAt}</span></article>
  </section>
  <h2>Evidence</h2>
  {evidence.length===0?<p className="muted">Нет записей evidence.</p>:
  <div className="table-wrap"><table><thead><tr><th>Источник</th><th>Тип</th><th>Текст</th><th>Платформа</th><th>Дата</th></tr></thead><tbody>{evidence.map(e=><tr key={e.id}><td>{e.source_url}</td><td>{e.location_type}</td><td>{e.excerpt}</td><td>{e.platform}</td><td>{e.discovered_at}</td></tr>)}</tbody></table></div>}
  <p><a href="/contacts">← Назад к списку</a></p></>;
}
