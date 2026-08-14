import { getRepositories } from '../../lib/db';
export const dynamic='force-dynamic';
export default async function Contacts({searchParams}:{searchParams:Promise<{q?:string;type?:string;platform?:string;status?:string;foreign?:string}>}){
  const {q='',type='',platform='',status='',foreign=''}=await searchParams;
  const filters={type:type||undefined,platform:platform||undefined,verificationStatus:status||undefined,isForeign:foreign===''?undefined:foreign==='true'};
  const rows=getRepositories().contacts.list(q,filters);
  return <><p className="eyebrow">Evidence-backed directory</p><h1>Contacts</h1>
  <div className="toolbar panel"><form>
    <input name="q" defaultValue={q} placeholder="Имя, агентство или номер"/>
    <select name="type" defaultValue={type}><option value="">Тип: все</option><option value="agent">agent</option><option value="agency">agency</option><option value="unknown">unknown</option></select>
    <select name="status" defaultValue={status}><option value="">Статус: все</option><option value="unreviewed">unreviewed</option><option value="verified">verified</option><option value="rejected">rejected</option></select>
    <select name="foreign" defaultValue={foreign}><option value="">Происхождение: все</option><option value="false">Азербайджан</option><option value="true">Зарубежный</option></select>
    <button>Поиск</button></form>
    <a href="/api/contacts/export"><button>CSV экспорт</button></a></div>
  <div className="table-wrap"><table><thead><tr><th>Контакт</th><th>Номер</th><th>Класс</th><th>Платформа</th><th>Проверка</th><th>Обнаружен</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><a href={`/contacts/${c.id}`}>{c.name??'—'}</a><br/><span className="muted">{c.agency??c.username??'—'}</span></td><td>{c.originalPhone}<br/><strong>{c.normalizedPhone}</strong>{c.isForeign&&<span className="badge">foreign</span>}</td><td>{c.type}<br/><span className="muted">{Math.round(c.confidence*100)}% · {c.reasons.join(', ')}</span></td><td>{c.platform??'—'}</td><td>{c.verificationStatus}</td><td>{c.firstSeenAt}<br/><span className="muted">{c.lastSeenAt}</span></td></tr>)}</tbody></table></div>
  {rows.length===0&&<p className="muted">Ничего не найдено. Измените фильтры или запустите сбор.</p>}</>;
}
