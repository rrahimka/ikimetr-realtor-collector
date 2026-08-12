import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import { runWorkerOnce } from './worker.js';

let db:CollectorDatabase|undefined; afterEach(()=>db?.close());
function setup(){db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Fixture',type:'test_fixture',locator:'fixture://contacts',language:'mixed',maxPages:1,maxDepth:0,delayMs:0,enabled:true,killSwitch:false});const run=repos.runs.enqueue(source.id);return{repos,source,run};}

describe('worker',()=>{
  it('processes connector evidence into a classified normalized contact',async()=>{const {repos,run}=setup();await runWorkerOnce(repos,()=>Promise.resolve({pagesChecked:1,estimatedItems:1,items:[{sourceUrl:'https://fixture.invalid/page',locationType:'listing',excerpt:'Bakı əmlakçı 050 123 45 67, çoxlu mənzil satışı',rawPhone:'050 123 45 67',platform:'fixture',fingerprint:'worker-fingerprint-1'}]}));expect(repos.runs.get(run.id)).toMatchObject({status:'completed',pagesChecked:1,phonesFound:1,uniquePhones:1});expect(repos.contacts.list()[0]).toMatchObject({normalizedPhone:'+994501234567',type:'agent'});});
  it('stops a run before writes when cancellation is requested',async()=>{const {repos,run}=setup();repos.runs.requestCancellation(run.id);await runWorkerOnce(repos,()=>Promise.resolve({pagesChecked:1,estimatedItems:1,items:[{sourceUrl:'https://fixture.invalid/page',locationType:'listing',excerpt:'Makler 050 123 45 67',rawPhone:'050 123 45 67',platform:'fixture',fingerprint:'worker-fingerprint-2'}]}));expect(repos.runs.get(run.id)?.status).toBe('cancelled');expect(repos.contacts.list()).toHaveLength(0);});
  it('records one connector failure without throwing from the polling loop',async()=>{const {repos,run}=setup();await expect(runWorkerOnce(repos,()=>Promise.reject(new Error('source blocked')))).resolves.toBe(true);expect(repos.runs.get(run.id)).toMatchObject({status:'failed',error:'source blocked'});});
});
