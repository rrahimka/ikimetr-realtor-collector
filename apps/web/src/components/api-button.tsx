'use client';
import { useState } from 'react';
function csrf(){return document.cookie.split('; ').find(v=>v.startsWith('csrf_token='))?.split('=')[1]??'';}
export function ApiButton({url,label,body,kind='button'}:{url:string;label:string;body?:unknown;kind?:'button'|'danger'}){const[busy,setBusy]=useState(false);return <button className={kind} disabled={busy} onClick={async()=>{setBusy(true);const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify(body??{})});setBusy(false);if(response.ok)location.reload();else alert((await response.json().catch(()=>({error:'Request failed'}))).error);}}>{busy?'…':label}</button>}
export async function apiMutation(url:string,method:string,body?:unknown){return fetch(url,{method,headers:{'content-type':'application/json','x-csrf-token':csrf()},body:body===undefined?undefined:JSON.stringify(body)});}
