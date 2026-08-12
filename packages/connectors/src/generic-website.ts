import { createHash } from 'node:crypto';
import type { AddressResolver } from '@ikimetr/core';
import { assertSafeUrl, extractPhones } from '@ikimetr/core';
import { load } from 'cheerio';
import type { ConnectorEvidence, ConnectorResult, CrawlOptions } from './types.js';

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface FetchDependencies { fetcher?: Fetcher; resolver?: AddressResolver; maxBytes?: number; timeoutMs?: number }

export async function safeFetch(input: string | URL, deps: FetchDependencies = {}): Promise<{ response: Response; url: URL; body: string }> {
  const fetcher = deps.fetcher ?? fetch; const maxBytes = deps.maxBytes ?? 2_000_000; const timeoutMs = deps.timeoutMs ?? 15_000;
  let url = await assertSafeUrl(input, deps.resolver); let redirects = 0;
  while (true) {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'ikimetr-realtor-collector/0.1 (+local research tool)', accept: 'text/html,text/plain;q=0.9' } });
    const redirectStatuses: number[] = [301, 302, 303, 307, 308];
    if (redirectStatuses.includes(response.status)) {
      if (++redirects > 5) throw new Error('redirect limit exceeded');
      const location=response.headers.get('location'); if(!location) throw new Error('redirect missing location');
      url=await assertSafeUrl(new URL(location,url),deps.resolver); continue;
    }
    const length=Number(response.headers.get('content-length') ?? 0); if(length>maxBytes) throw new Error('response size limit exceeded');
    const reader=response.body?.getReader(); if(!reader) return {response,url,body:''};
    const parts:Uint8Array[]=[]; let size=0;
    while(true){ const chunk=await reader.read(); if(chunk.done) break; size+=chunk.value.byteLength; if(size>maxBytes){ await reader.cancel(); throw new Error('response size limit exceeded'); } parts.push(chunk.value); }
    const bytes=new Uint8Array(size); let offset=0; for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return {response,url,body:new TextDecoder().decode(bytes)};
  }
}

function isAllowedByRobots(robots:string,path:string):boolean { const lines=robots.split(/\r?\n/); let relevant=false; for(const raw of lines){const [key,...rest]=raw.split(':');const value=rest.join(':').trim();if(key?.trim().toLowerCase()==='user-agent') relevant=value==='*'; if(relevant&&key?.trim().toLowerCase()==='disallow'&&value&&path.startsWith(value)) return false;} return true; }
function excerpt(text:string,raw:string){const at=text.indexOf(raw);return text.slice(Math.max(0,at-80),Math.min(text.length,at+raw.length+80)).replace(/\s+/g,' ').trim();}
const fingerprint=(...parts:string[])=>createHash('sha256').update(parts.join('\0')).digest('hex');

export async function crawlWebsite(options:CrawlOptions,deps:FetchDependencies={}):Promise<ConnectorResult>{
  const start=await assertSafeUrl(options.startUrl,deps.resolver); const robotsUrl=new URL('/robots.txt',start);
  const robots=await safeFetch(robotsUrl,{...deps,maxBytes:200_000,timeoutMs:options.timeoutMs}).catch(()=>undefined);
  if(robots?.response.ok&&!isAllowedByRobots(robots.body,start.pathname)) throw new Error('blocked by robots.txt');
  const queue=[{url:start,depth:0}]; const visited=new Set<string>(); const items:ConnectorEvidence[]=[];
  while(queue.length&&visited.size<options.maxPages){const next=queue.shift()!;if(visited.has(next.url.href))continue;visited.add(next.url.href);if(options.delayMs>0)await new Promise(r=>setTimeout(r,options.delayMs));const page=await safeFetch(next.url,{...deps,maxBytes:options.maxBytes,timeoutMs:options.timeoutMs});if(!page.response.ok)throw new Error(`HTTP ${page.response.status}`);const contentType=page.response.headers.get('content-type')??'';if(!contentType.includes('text/html')&&!contentType.includes('text/plain'))continue;const $=load(page.body);$('script,style,noscript').remove();const text=$('body').find('*').addBack().contents().filter((_i,node)=>node.type===('text' as const)).map((_i,node)=>$(node).text()).get().join(' ').replace(/\s+/g,' ').trim();const candidates=[...extractPhones(text).map(p=>({raw:p.raw,context:excerpt(text,p.raw)}))];$('a[href^="tel:"]').each((_i,node)=>{const raw=$(node).attr('href')!.slice(4).split('?')[0]!;candidates.push({raw,context:`tel:${raw}`});});$('a[href*="wa.me/"]').each((_i,node)=>{const href=$(node).attr('href')!;const match=/wa\.me\/(\d{7,15})/.exec(href);if(match?.[1])candidates.push({raw:match[1],context:href});});const seen=new Set<string>();for(const candidate of candidates){const key=fingerprint(page.url.href,candidate.raw,candidate.context);if(seen.has(key))continue;seen.add(key);items.push({sourceUrl:page.url.href,locationType:'listing',excerpt:candidate.context,rawPhone:candidate.raw,platform:'website',fingerprint:key});}if(next.depth<options.maxDepth)$('a[href]').each((_i,node)=>{try{const url=new URL($(node).attr('href')!,page.url);if(url.origin===start.origin&&['http:','https:'].includes(url.protocol))queue.push({url,depth:next.depth+1});}catch{/* invalid link */}});}
  return {items,pagesChecked:visited.size,estimatedItems:items.length};
}
