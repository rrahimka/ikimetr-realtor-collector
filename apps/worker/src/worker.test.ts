import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createRepositories, type CollectorDatabase } from '@ikimetr/database';
import { createConnectorRunner } from './connectors.js';
import { runWorkerOnce } from './worker.js';

let db:CollectorDatabase|undefined; afterEach(()=>{db?.close();vi.restoreAllMocks();});
function setup(){db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Fixture',type:'test_fixture',locator:'fixture://contacts',language:'mixed',maxPages:1,maxDepth:0,delayMs:0,enabled:true,killSwitch:false});const run=repos.runs.enqueue(source.id);return{repos,source,run};}

describe('createConnectorRunner',()=>{
  it('allows the artificial fixture when it is explicitly enabled outside NODE_ENV=test',async()=>{const {source}=setup();await expect(createConnectorRunner({ALLOW_TEST_CONNECTOR:'true'})(source)).resolves.toMatchObject({pagesChecked:1,estimatedItems:1});});
  it('blocks the artificial fixture with an empty environment',async()=>{const {source}=setup();await expect(createConnectorRunner({})(source)).rejects.toThrow('Test connector is disabled outside tests');});
  it('blocks the artificial fixture when it is explicitly disabled',async()=>{const {source}=setup();await expect(createConnectorRunner({ALLOW_TEST_CONNECTOR:'false'})(source)).rejects.toThrow('Test connector is disabled outside tests');});
  it('produces only the artificial normalized fixture contact without network access',async()=>{const {repos,run}=setup();const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('network access is forbidden'));await runWorkerOnce(repos,createConnectorRunner({ALLOW_TEST_CONNECTOR:'true'}));expect(repos.runs.get(run.id)).toMatchObject({status:'completed',pagesChecked:1,phonesFound:1,uniquePhones:1});expect(repos.contacts.list()).toEqual([expect.objectContaining({normalizedPhone:'+994501234567',name:'Aysel Məmmədova',platform:'fixture'})]);expect(fetchSpy).not.toHaveBeenCalled();});

  it('passes hard-limited Bina options and live stop guards to the dedicated runner',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:100,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});
    const env={BINA_ENABLED:'true',BINA_PERMISSION_CONFIRMED:'true'};
    let captured: Record<string, unknown> | undefined;
    const runner=createConnectorRunner(env, {runBina:(options)=>{captured=options as unknown as Record<string,unknown>;return Promise.resolve({items:[],pagesChecked:0,estimatedItems:0,outcomes:{accepted:0,duplicate:0,private_seller:0,missing_phone:0,invalid_phone:0,page_removed:0,blocked:0,parse_error:0,cancelled:0}});}});
    await runner(source,{shouldStop:()=>false});
    expect(captured).toMatchObject({startUrl:'https://bina.az/search',maxListings:100,delayMs:10000});
    expect(await (captured?.permission as ()=>Promise<boolean>)()).toBe(true);
    env.BINA_PERMISSION_CONFIRMED='false';
    expect(await (captured?.permission as ()=>Promise<boolean>)()).toBe(false);
    expect(await (captured?.shouldStop as ()=>Promise<false>)()).toBe(false);
  });

  it('does not launch Bina when either permission flag is disabled',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:5,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});
    const runBina=vi.fn();
    const result=await createConnectorRunner({BINA_ENABLED:'true',BINA_PERMISSION_CONFIRMED:'false'},{runBina})(source,{shouldStop:()=>false});
    expect(runBina).not.toHaveBeenCalled();
    expect(result).toMatchObject({stopReason:'permission_disabled',outcomes:{blocked:1}});
  });

  it.each(['website','listing_page'] as const)('never dispatches the production generic %s connector',async(type)=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Generic',type,locator:'https://bina.az/search',language:'AZ',maxPages:1,maxDepth:0,delayMs:0,enabled:true,killSwitch:false});
    const crawlWebsite=vi.fn();
    await expect(createConnectorRunner({}, {runBina:vi.fn(),crawlWebsite})(source)).rejects.toThrow('disabled in local-only mode');
    expect(crawlWebsite).not.toHaveBeenCalled();
  });
});

describe('worker',()=>{
  it('processes connector evidence into a classified normalized contact',async()=>{const {repos,run}=setup();await runWorkerOnce(repos,()=>Promise.resolve({pagesChecked:1,estimatedItems:1,items:[{sourceUrl:'https://fixture.invalid/page',locationType:'listing',excerpt:'Bakı əmlakçı 050 123 45 67, çoxlu mənzil satışı',rawPhone:'050 123 45 67',platform:'fixture',fingerprint:'worker-fingerprint-1'}]}));expect(repos.runs.get(run.id)).toMatchObject({status:'completed',pagesChecked:1,phonesFound:1,uniquePhones:1});expect(repos.contacts.list()[0]).toMatchObject({normalizedPhone:'+994501234567',type:'agent'});});
  it('stops a run before writes when cancellation is requested',async()=>{const {repos,run}=setup();repos.runs.requestCancellation(run.id);await runWorkerOnce(repos,()=>Promise.resolve({pagesChecked:1,estimatedItems:1,items:[{sourceUrl:'https://fixture.invalid/page',locationType:'listing',excerpt:'Makler 050 123 45 67',rawPhone:'050 123 45 67',platform:'fixture',fingerprint:'worker-fingerprint-2'}]}));expect(repos.runs.get(run.id)?.status).toBe('cancelled');expect(repos.contacts.list()).toHaveLength(0);});
  it('records one connector failure without throwing from the polling loop',async()=>{const {repos,run}=setup();await expect(runWorkerOnce(repos,()=>Promise.reject(new Error('source blocked')))).resolves.toBe(true);expect(repos.runs.get(run.id)).toMatchObject({status:'failed',error:'source blocked'});});

  it('stores a protected Bina stop as blocked with a safe audit summary',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:5,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});const run=repos.runs.enqueue(source.id);
    await runWorkerOnce(repos,()=>Promise.resolve({items:[],pagesChecked:0,estimatedItems:0,stopReason:'captcha',outcomes:{accepted:0,duplicate:0,private_seller:0,missing_phone:0,invalid_phone:0,page_removed:0,blocked:1,parse_error:0,cancelled:0}}));
    expect(repos.runs.get(run.id)).toMatchObject({status:'blocked',error:'captcha'});
    const summary=repos.audit.list().find((event)=>event.action==='run.bina.summary');
    expect(summary).toMatchObject({action:'run.bina.summary'});
    if (!summary?.details || typeof summary.details !== 'object') throw new Error('Bina summary details missing');
    const details=summary.details as Record<string,unknown>;
    if (!details.outcomes || typeof details.outcomes !== 'object') throw new Error('Bina outcomes missing');
    expect((details.outcomes as Record<string,unknown>).blocked).toBe(1);
  });

  it('persists accepted Bina evidence collected before a later blocked stop',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:5,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});const run=repos.runs.enqueue(source.id);
    await runWorkerOnce(repos,()=>Promise.resolve({items:[{sourceUrl:'https://bina.az/items/401',locationType:'listing',excerpt:'Agentlik · Bakı Emlak',rawPhone:'+994501234567',agency:'Bakı Emlak',platform:'bina.az',fingerprint:'blocked-after-accepted'}],pagesChecked:2,estimatedItems:2,stopReason:'captcha',outcomes:{accepted:1,duplicate:0,private_seller:0,missing_phone:0,invalid_phone:0,page_removed:0,blocked:1,parse_error:0,cancelled:0}}));
    expect(repos.runs.get(run.id)).toMatchObject({status:'blocked',error:'captcha',phonesFound:1,uniquePhones:1});
    expect(repos.contacts.list()).toHaveLength(1);
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(1);
  });

  it('deduplicates a Bina phone, preserves verification, and stores evidence per listing',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:5,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});
    const item=(id:number)=>({sourceUrl:`https://bina.az/items/${id}`,locationType:'listing' as const,excerpt:'Agentlik · Bakı Emlak',rawPhone:'+994501234567',name:'Aysel',agency:'Bakı Emlak',platform:'bina.az',fingerprint:`bina-evidence-${id}`});
    const result=(id:number)=>({items:[item(id)],pagesChecked:1,estimatedItems:1,outcomes:{accepted:1,duplicate:0,private_seller:0,missing_phone:0,invalid_phone:0,page_removed:0,blocked:0,parse_error:0,cancelled:0}});
    const first=repos.runs.enqueue(source.id);await runWorkerOnce(repos,()=>Promise.resolve(result(1)));const contact=repos.contacts.list()[0]!;repos.reviews.setStatus(contact.id,'verified');
    const second=repos.runs.enqueue(source.id);await runWorkerOnce(repos,()=>Promise.resolve(result(2)));
    expect(repos.contacts.list()).toHaveLength(1);
    expect(repos.contacts.get(contact.id)?.verificationStatus).toBe('verified');
    expect(repos.contacts.evidenceFor('+994501234567')).toHaveLength(2);
    expect(repos.runs.get(first.id)?.status).toBe('completed');
    expect(repos.runs.get(second.id)?.status).toBe('completed');
    const summary=repos.audit.list().filter((event)=>event.action==='run.bina.summary').at(-1);
    expect(summary?.details).toEqual(expect.objectContaining({newContacts:0,duplicates:1,agenciesFound:1}));
  });

  it('redacts an unexpected Bina connector error before persistence',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:5,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});const run=repos.runs.enqueue(source.id);
    await runWorkerOnce(repos,()=>Promise.reject(new Error('remote failure for +994501234567')));
    expect(repos.runs.get(run.id)).toMatchObject({status:'failed',error:'Bina connector failed'});
    expect(repos.runs.get(run.id)?.error).not.toContain('+994501234567');
  });

  it('provides a seven-day SQLite evidence recheck policy to the Bina connector',async()=>{
    db=createDatabase(':memory:');const repos=createRepositories(db);const source=repos.sources.create({name:'Bina',type:'bina_agency',locator:'https://bina.az/search',language:'AZ',maxPages:5,maxDepth:0,delayMs:10000,enabled:true,killSwitch:false});
    const classification={type:'agency' as const,confidence:0.9,reasons:['agency_name'],ruleVersion:'1.0.0' as const,classifiedAt:new Date().toISOString()};
    const persist=(phone:string,url:string,fingerprint:string)=>repos.contacts.persistEvidence({normalizedPhone:phone,isForeign:false,evidence:{sourceId:source.id,sourceUrl:url,locationType:'listing',excerpt:'Agentlik',rawPhone:phone,platform:'bina.az',fingerprint},classification});
    persist('+994501111111','https://bina.az/items/301','recent-recheck-evidence');
    persist('+994502222222','https://bina.az/items/302','old-recheck-evidence');
    db.prepare("UPDATE evidence SET discovered_at='2026-08-01T00:00:00.000Z' WHERE source_url='https://bina.az/items/302'").run();
    repos.runs.enqueue(source.id);
    let recentAllowed: boolean | undefined;
    let oldAllowed: boolean | undefined;
    await runWorkerOnce(repos,async(_source,context)=>{
      recentAllowed=await context?.shouldProcessUrl?.('https://bina.az/items/301');
      oldAllowed=await context?.shouldProcessUrl?.('https://bina.az/items/302');
      return{items:[],pagesChecked:0,estimatedItems:0,outcomes:{accepted:0,duplicate:0,private_seller:0,missing_phone:0,invalid_phone:0,page_removed:0,blocked:0,parse_error:0,cancelled:0}};
    });
    expect(recentAllowed).toBe(false);
    expect(oldAllowed).toBe(true);
  });

  it('records bina_listings states via onListingChecked callback during worker run', async () => {
    db = createDatabase(':memory:');
    const repos = createRepositories(db);
    const source = repos.sources.create({ name: 'Bina', type: 'bina_agency', locator: 'https://bina.az/search', language: 'AZ', maxPages: 5, maxDepth: 0, delayMs: 10000, enabled: true, killSwitch: false });
    repos.runs.enqueue(source.id);
    await runWorkerOnce(repos, async (_source, context) => {
      await context?.onListingChecked?.('https://bina.az/items/901', { outcome: 'private_seller', sellerType: 'owner' });
      await context?.onListingChecked?.('https://bina.az/items/902', { outcome: 'page_removed' });
      return { items: [], pagesChecked: 2, estimatedItems: 2, outcomes: { accepted: 0, duplicate: 0, private_seller: 1, missing_phone: 0, invalid_phone: 0, page_removed: 1, blocked: 0, parse_error: 0, cancelled: 0 } };
    });
    const stats = repos.binaListings.stats(source.id);
    expect(stats.privateSkippedCount).toBe(1);
    expect(stats.totalChecked).toBe(2);
  });
});
