import { classifyEvidence, extractPhones, normalizePhone, type SourceInput } from '@ikimetr/core';
import type { ConnectorEvidence, ConnectorResult } from '@ikimetr/connectors';
import type { createRepositories } from '@ikimetr/database';

type Repositories = ReturnType<typeof createRepositories>;
export type ConnectorRunner = (source:ReturnType<Repositories['sources']['get']> & {})=>Promise<ConnectorResult>;

export async function processRun(repos:Repositories,run:{id:number;sourceId:number},connector:ConnectorRunner):Promise<void>{
  const source=repos.sources.get(run.sourceId); if(!source)throw new Error('source not found');
  if(!source.enabled||source.killSwitch){repos.runs.finish(run.id,'cancelled');return;}
  if(repos.runs.shouldCancel(run.id)){repos.runs.finish(run.id,'cancelled');return;}
  const result=await connector(source); let found=0; const unique=new Set<string>();
  for(const item of result.items){if(repos.runs.shouldCancel(run.id)){repos.runs.finish(run.id,'cancelled',{pagesChecked:result.pagesChecked,phonesFound:found,uniquePhones:unique.size});return;}const extracted=extractPhones(`${item.rawPhone} ${item.excerpt}`);const preferred=normalizePhone(item.rawPhone);const phones=preferred.isValid?[preferred]:extracted;for(const phone of phones){if(!phone.isValid||!phone.normalized)continue;found++;unique.add(phone.normalized);const classification=classifyEvidence({text:item.excerpt,occurrenceCount:extracted.length});repos.contacts.persistEvidence({normalizedPhone:phone.normalized,isForeign:phone.isForeign,evidence:{sourceId:source.id,sourceUrl:item.sourceUrl,locationType:item.locationType,excerpt:item.excerpt,rawPhone:phone.raw,name:item.name??null,agency:item.agency??null,username:item.username??null,platform:item.platform,fingerprint:`${item.fingerprint}-${phone.normalized}`},classification});}}
  repos.runs.finish(run.id,'completed',{pagesChecked:result.pagesChecked,phonesFound:found,uniquePhones:unique.size});
}

export async function runWorkerOnce(repos:Repositories,connector:ConnectorRunner):Promise<boolean>{const run=repos.runs.claimNext();if(!run)return false;try{await processRun(repos,run,connector);}catch(error){repos.runs.finish(run.id,'failed',undefined,error instanceof Error?error.message:'Unknown connector error');}return true;}

export async function runWorker(options:{repos:Repositories;connector:ConnectorRunner;signal:AbortSignal;pollMs?:number}){options.repos.runs.recoverAbandoned();while(!options.signal.aborted){const worked=await runWorkerOnce(options.repos,options.connector);if(!worked)await new Promise<void>((resolve)=>{const id=setTimeout(resolve,options.pollMs??1000);options.signal.addEventListener('abort',()=>{clearTimeout(id);resolve();},{once:true});});}}
