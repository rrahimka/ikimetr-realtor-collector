'use client';import { useState } from 'react';import { useRouter } from 'next/navigation';import { t, type Lang } from '../lib/i18n';
function csrf(){return document.cookie.split('; ').find(v=>v.startsWith('csrf_token='))?.split('=')[1]??'';}
type Report={total:number;accepted:number;rejected:number;duplicates:number;errors:Array<{line:number;reason:string}>};
export function ContactsImport({lang}:{lang:Lang}){const router=useRouter();const[busy,setBusy]=useState(false);const[report,setReport]=useState<Report|null>(null);const[error,setError]=useState('');
return <div className="panel"><h2>{t(lang,'import.title')}</h2><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);const file=f.get('file');if(!(file instanceof File)||!file.name){setError(t(lang,'import.file'));setBusy(false);return;}const body=new FormData();body.append('file',file);const r=await fetch('/api/import/contacts',{method:'POST',headers:{'x-csrf-token':csrf()},body});setBusy(false);if(r.ok){setReport(await r.json() as Report);router.refresh();}else setError(((await r.json().catch(()=>({error:'Request failed'}))) as {error?:string}).error??'Request failed');}}>
<label>{t(lang,'import.file')}<input name="file" type="file" accept=".csv,text/csv"/></label>
<button disabled={busy}>{busy?'…':t(lang,'import.submit')}</button>
<a href="/api/import/contacts">template.csv</a></form>
{error&&<p className="error">{error}</p>}
{report&&<div className="cards"><article className="card"><span className="muted">{t(lang,'import.total')}</span><strong>{report.total}</strong></article><article className="card"><span className="muted">{t(lang,'import.accepted')}</span><strong>{report.accepted}</strong></article><article className="card"><span className="muted">{t(lang,'import.rejected')}</span><strong>{report.rejected}</strong></article><article className="card"><span className="muted">{t(lang,'import.duplicates')}</span><strong>{report.duplicates}</strong></article></div>}
{report&&report.errors.length>0&&<ul className="errors">{report.errors.map((er,i)=><li key={i}>{t(lang,'import.rejected')} #{er.line}: {er.reason}</li>)}</ul>}
</div>}
