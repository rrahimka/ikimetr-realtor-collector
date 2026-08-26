import type { Classification, EvidenceInput, SourceInput } from '@ikimetr/core';
import type { CollectorDatabase } from './client';

const now = () => new Date().toISOString();
type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
type RunCounters = { pagesChecked: number; phonesFound: number; uniquePhones: number };
type BinaRunSummary = { outcomes: Record<string, number>; newContacts: number; duplicates: number; agenciesFound?: number };

function mapSource(row: Record<string, unknown>) { return { id: row.id as number, name: row.name as string, type: row.type as SourceInput['type'], locator: row.locator as string, language: row.language as SourceInput['language'], maxPages: row.max_pages as number, maxDepth: row.max_depth as number, delayMs: row.delay_ms as number, enabled: Boolean(row.enabled), killSwitch: Boolean(row.kill_switch) }; }
function mapRun(row: Record<string, unknown>) { return { id: row.id as number, sourceId: row.source_id as number, status: row.status as RunStatus, startedAt: row.started_at as string | null, finishedAt: row.finished_at as string | null, pagesChecked: row.pages_checked as number, phonesFound: row.phones_found as number, uniquePhones: row.unique_phones as number, error: row.error as string | null, cancellationRequested: Boolean(row.cancellation_requested), needsReview: Boolean(row.needs_review) }; }
function mapContact(row: Record<string, unknown>) { return { id: row.id as number, normalizedPhone: row.normalized_phone as string, originalPhone: row.original_phone as string, isForeign: Boolean(row.is_foreign), type: row.type as string, name: row.name as string | null, agency: row.agency as string | null, city: row.city as string | null, username: row.username as string | null, platform: row.platform as string | null, confidence: row.confidence as number, reasons: JSON.parse(row.reasons_json as string) as string[], verificationStatus: row.verification_status as string, mergedIntoId: row.merged_into_id as number | null, firstSeenAt: row.first_seen_at as string, lastSeenAt: row.last_seen_at as string }; }

export function createRepositories(db: CollectorDatabase) {
  const audit = {
    record(action: string, entityType: string, entityId: number, details: unknown) { db.prepare('INSERT INTO audit_events(action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?)').run(action, entityType, entityId, JSON.stringify(details), now()); },
    list() { return (db.prepare('SELECT * FROM audit_events ORDER BY id').all() as Array<Record<string, unknown>>).map((row) => ({ id: row.id as number, action: row.action as string, entityType: row.entity_type as string, entityId: row.entity_id as number, details: JSON.parse(row.details_json as string) as unknown, createdAt: row.created_at as string })); },
  };
  const sources = {
    create(input: SourceInput) { const time = now(); const result = db.prepare('INSERT INTO sources(name,type,locator,language,max_pages,max_depth,delay_ms,enabled,kill_switch,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(input.name, input.type, input.locator, input.language, input.maxPages, input.maxDepth, input.delayMs, Number(input.enabled), Number(input.killSwitch), time, time); return this.get(Number(result.lastInsertRowid))!; },
    get(id: number) { const row = db.prepare('SELECT * FROM sources WHERE id=?').get(id) as Record<string, unknown> | undefined; return row ? mapSource(row) : undefined; },
    list() { return (db.prepare('SELECT * FROM sources ORDER BY id DESC').all() as Record<string, unknown>[]).map(mapSource); },
    update(id: number, input: Partial<SourceInput>) { const old = this.get(id); if (!old) throw new Error('source not found'); const next = { ...old, ...input }; db.prepare('UPDATE sources SET name=?,type=?,locator=?,language=?,max_pages=?,max_depth=?,delay_ms=?,enabled=?,kill_switch=?,updated_at=? WHERE id=?').run(next.name,next.type,next.locator,next.language,next.maxPages,next.maxDepth,next.delayMs,Number(next.enabled),Number(next.killSwitch),now(),id); return this.get(id)!; },
    remove(id: number) { return db.prepare('DELETE FROM sources WHERE id=?').run(id).changes > 0; },
    bulkRun(ids: number[]) { const enqueued: number[] = []; for (const id of ids) { if (!runs.hasActive(id)) { try { const run = runs.enqueue(id); enqueued.push(run.id); } catch { /* ignore if active */ } } } return enqueued; },
    bulkKill(ids: number[]) { const updated: number[] = []; for (const id of ids) { const source = this.get(id); if (source) { this.update(id, { killSwitch: !source.killSwitch }); updated.push(id); } } return updated; },
    bulkDelete(ids: number[]) { let count = 0; for (const id of ids) { if (this.remove(id)) count++; } return count; },
  };
  const keywords = {
    create(value:string,language:'AZ'|'RU'|'EN'|'mixed'){const result=db.prepare('INSERT OR IGNORE INTO keywords(value,language,created_at) VALUES(?,?,?)').run(value.trim(),language,now());if(!result.lastInsertRowid)return db.prepare('SELECT * FROM keywords WHERE value=?').get(value.trim()) as {id:number;value:string;language:string};return{id:Number(result.lastInsertRowid),value:value.trim(),language};},
    list(){return db.prepare('SELECT * FROM keywords ORDER BY language,value').all() as Array<{id:number;value:string;language:string}>;},
    remove(id:number){return db.prepare('DELETE FROM keywords WHERE id=?').run(id).changes>0;},
  };
  const runs = {
    enqueue(sourceId: number) { try { const result = db.prepare("INSERT INTO runs(source_id,status,pages_checked,phones_found,unique_phones,cancellation_requested,needs_review,created_at) VALUES(?,'queued',0,0,0,0,0,?)").run(sourceId, now()); return this.get(Number(result.lastInsertRowid))!; } catch (error) { if (String(error).includes('UNIQUE')) throw new Error('source already has an active run'); throw error; } },
    get(id: number) { const row = db.prepare('SELECT * FROM runs WHERE id=?').get(id) as Record<string, unknown> | undefined; return row ? mapRun(row) : undefined; },
    list() { return (db.prepare('SELECT * FROM runs ORDER BY id DESC').all() as Record<string, unknown>[]).map(mapRun); },
    hasActive(sourceId: number) { return Boolean((db.prepare("SELECT 1 present FROM runs WHERE source_id=? AND status IN ('queued','running') LIMIT 1").get(sourceId) as { present: number } | undefined)?.present); },
    latestTerminal(sourceId: number) { const row = db.prepare("SELECT * FROM runs WHERE source_id=? AND status NOT IN ('queued','running') ORDER BY COALESCE(finished_at,created_at) DESC,id DESC LIMIT 1").get(sourceId) as Record<string, unknown> | undefined; return row ? mapRun(row) : undefined; },
    claimNext() { const claim = db.transaction(() => { const row = db.prepare("SELECT id FROM runs WHERE status='queued' ORDER BY id LIMIT 1").get() as {id:number}|undefined; if (!row) return undefined; db.prepare("UPDATE runs SET status='running',started_at=? WHERE id=? AND status='queued'").run(now(), row.id); return this.get(row.id); }); return claim(); },
    requestCancellation(id: number) { db.prepare('UPDATE runs SET cancellation_requested=1 WHERE id=?').run(id); },
    shouldCancel(id: number) { return Boolean((db.prepare('SELECT cancellation_requested FROM runs WHERE id=?').get(id) as {cancellation_requested:number}|undefined)?.cancellation_requested); },
    finish(id: number, status: Exclude<RunStatus, 'queued'|'running'>, counters: RunCounters = { pagesChecked: 0, phonesFound: 0, uniquePhones: 0 }, error?: string) { db.prepare('UPDATE runs SET status=?,finished_at=?,pages_checked=?,phones_found=?,unique_phones=?,error=? WHERE id=?').run(status,now(),counters.pagesChecked,counters.phonesFound,counters.uniquePhones,error ?? null,id); },
    finishBina(id: number, status: 'completed' | 'blocked' | 'cancelled', counters: RunCounters, reason: string | undefined, summary: BinaRunSummary) { db.transaction(() => { this.finish(id, status, counters, reason); audit.record('run.bina.summary', 'run', id, summary); })(); return this.get(id)!; },
    recoverAbandoned() { return db.prepare("UPDATE runs SET status='failed',finished_at=?,needs_review=1,error=COALESCE(error,'Worker restarted during run') WHERE status='running'").run(now()).changes; },
  };
  const contacts = {
    persistEvidence(input: { normalizedPhone: string; isForeign: boolean; evidence: EvidenceInput; classification: Classification }) { return db.transaction(() => { const time=now(); db.prepare(`INSERT INTO contacts(normalized_phone,original_phone,is_foreign,type,name,agency,city,username,platform,confidence,reasons_json,rule_version,classified_at,verification_status,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_phone) DO UPDATE SET last_seen_at=excluded.last_seen_at,name=COALESCE(excluded.name,contacts.name),agency=COALESCE(excluded.agency,contacts.agency),city=COALESCE(excluded.city,contacts.city),username=COALESCE(excluded.username,contacts.username),confidence=MAX(contacts.confidence,excluded.confidence)`).run(input.normalizedPhone,input.evidence.rawPhone,Number(input.isForeign),input.classification.type,input.evidence.name ?? null,input.evidence.agency ?? null,input.evidence.city ?? null,input.evidence.username ?? null,input.evidence.platform,input.classification.confidence,JSON.stringify(input.classification.reasons),input.classification.ruleVersion,input.classification.classifiedAt,'unreviewed',time,time); const contact=this.byPhone(input.normalizedPhone)!; db.prepare('INSERT OR IGNORE INTO evidence(contact_id,source_id,source_url,location_type,excerpt,raw_phone,platform,fingerprint,discovered_at) VALUES(?,?,?,?,?,?,?,?,?)').run(contact.id,input.evidence.sourceId,input.evidence.sourceUrl,input.evidence.locationType,input.evidence.excerpt,input.evidence.rawPhone,input.evidence.platform,input.evidence.fingerprint,time); return contact; })(); },
    get(id: number) { const row=db.prepare('SELECT * FROM contacts WHERE id=?').get(id) as Record<string,unknown>|undefined; return row ? mapContact(row) : undefined; },
    byPhone(phone: string) { const row=db.prepare('SELECT * FROM contacts WHERE normalized_phone=?').get(phone) as Record<string,unknown>|undefined; return row ? mapContact(row) : undefined; },
    list(search='', filters: { type?: string | undefined; platform?: string | undefined; verificationStatus?: string | undefined; isForeign?: boolean | undefined; city?: string | undefined } = {}) { const clauses: string[] = []; const params: unknown[] = []; if (search) { clauses.push("(normalized_phone LIKE ? OR COALESCE(name,'') LIKE ? OR COALESCE(agency,'') LIKE ? OR COALESCE(city,'') LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); } if (filters.type) { clauses.push('type = ?'); params.push(filters.type); } if (filters.platform) { clauses.push('platform = ?'); params.push(filters.platform); } if (filters.verificationStatus) { clauses.push('verification_status = ?'); params.push(filters.verificationStatus); } if (filters.isForeign !== undefined) { clauses.push('is_foreign = ?'); params.push(Number(filters.isForeign)); } if (filters.city) { clauses.push('city LIKE ?'); params.push(`%${filters.city}%`); } const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''; const rows = db.prepare(`SELECT * FROM contacts${where} ORDER BY id DESC`).all(...params); return (rows as Record<string,unknown>[]).map(mapContact); },
    evidenceFor(phone: string) { return db.prepare('SELECT e.* FROM evidence e JOIN contacts c ON c.id=e.contact_id WHERE c.normalized_phone=? ORDER BY e.id').all(phone) as Array<Record<string,unknown>>; },
  };
  const evidence = {
    wasUrlSeenSince(sourceId: number, sourceUrl: string, since: string) { return Boolean((db.prepare('SELECT 1 present FROM evidence WHERE source_id=? AND source_url=? AND discovered_at>=? LIMIT 1').get(sourceId, sourceUrl, since) as { present: number } | undefined)?.present); },
  };
  const reviews = {
    merge(targetId:number,sourceId:number,reason:string) { return db.transaction(() => { if (targetId===sourceId) throw new Error('cannot merge a contact into itself'); const result=db.prepare('INSERT INTO contact_merges(target_contact_id,source_contact_id,reason,merged_at) VALUES(?,?,?,?)').run(targetId,sourceId,reason,now()); db.prepare('UPDATE contacts SET merged_into_id=? WHERE id=?').run(targetId,sourceId); const id=Number(result.lastInsertRowid); audit.record('contact.merge','contact',sourceId,{targetId,reason}); return {id,targetId,sourceId}; })(); },
    undoMerge(id:number,reason:string) { return db.transaction(() => { const merge=db.prepare('SELECT * FROM contact_merges WHERE id=? AND undone_at IS NULL').get(id) as {source_contact_id:number}|undefined; if(!merge) throw new Error('active merge not found'); db.prepare('UPDATE contacts SET merged_into_id=NULL WHERE id=?').run(merge.source_contact_id); db.prepare('UPDATE contact_merges SET undone_at=?,undo_reason=? WHERE id=?').run(now(),reason,id); audit.record('contact.merge.undo','contact',merge.source_contact_id,{mergeId:id,reason}); })(); },
    setStatus(contactId:number,status:'verified'|'rejected'|'unreviewed'){if(!contacts.get(contactId))throw new Error('contact not found');db.prepare('UPDATE contacts SET verification_status=? WHERE id=?').run(status,contactId);audit.record(`contact.${status}`,'contact',contactId,{status});return contacts.get(contactId)!;},
    listMerges(){return db.prepare('SELECT * FROM contact_merges ORDER BY id DESC').all() as Array<Record<string,unknown>>;},
  };

  const binaListings = {
    upsertDiscovered(sourceId: number, urls: string[]) {
      const time = now();
      const insert = db.prepare(`
        INSERT INTO bina_listings(source_id, listing_id, canonical_url, seller_type, status, discovered_at, created_at, updated_at)
        VALUES(?, ?, ?, 'unknown', 'discovered', ?, ?, ?)
        ON CONFLICT(source_id, canonical_url) DO UPDATE SET updated_at=excluded.updated_at
      `);
      const tx = db.transaction((list: string[]) => {
        let count = 0;
        for (const url of list) {
          const idMatch = /\/items\/(\d+)/.exec(url);
          const listingId = idMatch ? idMatch[1]! : url;
          const res = insert.run(sourceId, listingId, url, time, time, time);
          if (res.changes > 0) count += 1;
        }
        return count;
      });
      return tx(urls);
    },
    getUnchecked(sourceId: number, limit = 50) {
      const rows = db.prepare(`
        SELECT * FROM bina_listings
        WHERE source_id = ? AND status = 'discovered'
        ORDER BY id ASC
        LIMIT ?
      `).all(sourceId, limit) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: r.id as number,
        sourceId: r.source_id as number,
        listingId: r.listing_id as string,
        canonicalUrl: r.canonical_url as string,
        sellerType: r.seller_type as string,
        phone: r.phone as string | null,
        fingerprint: r.fingerprint as string | null,
        status: r.status as string,
        discoveredAt: r.discovered_at as string,
        lastCheckedAt: r.last_checked_at as string | null,
      }));
    },
    markChecked(sourceId: number, canonicalUrl: string, data: { sellerType: string; phone?: string | null; fingerprint?: string | null; status: 'checked' | 'skipped_owner' | 'failed' | 'removed' }) {
      const time = now();
      db.prepare(`
        INSERT INTO bina_listings(source_id, listing_id, canonical_url, seller_type, phone, fingerprint, status, discovered_at, last_checked_at, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, canonical_url) DO UPDATE SET
          seller_type=excluded.seller_type,
          phone=excluded.phone,
          fingerprint=excluded.fingerprint,
          status=excluded.status,
          last_checked_at=excluded.last_checked_at,
          updated_at=excluded.updated_at
      `).run(
        sourceId,
        /\/items\/(\d+)/.exec(canonicalUrl)?.[1] ?? canonicalUrl,
        canonicalUrl,
        data.sellerType,
        data.phone ?? null,
        data.fingerprint ?? null,
        data.status,
        time,
        time,
        time,
        time,
      );
    },
    stats(sourceId: number) {
      const row = db.prepare(`
        SELECT
          COUNT(*) as totalDiscovered,
          COUNT(CASE WHEN status != 'discovered' THEN 1 END) as totalChecked,
          COUNT(CASE WHEN status = 'checked' THEN 1 END) as professionalCount,
          COUNT(CASE WHEN status = 'skipped_owner' THEN 1 END) as privateSkippedCount,
          COUNT(CASE WHEN status = 'discovered' THEN 1 END) as pendingCount
        FROM bina_listings
        WHERE source_id = ?
      `).get(sourceId) as Record<string, number> | undefined;
      return {
        totalDiscovered: row?.totalDiscovered ?? 0,
        totalChecked: row?.totalChecked ?? 0,
        professionalCount: row?.professionalCount ?? 0,
        privateSkippedCount: row?.privateSkippedCount ?? 0,
        pendingCount: row?.pendingCount ?? 0,
      };
    },
    wasUrlCheckedRecently(sourceId: number, canonicalUrl: string, sinceDate: string) {
      return Boolean((db.prepare(`
        SELECT 1 as present FROM bina_listings
        WHERE source_id=? AND canonical_url=? AND last_checked_at >= ?
        LIMIT 1
      `).get(sourceId, canonicalUrl, sinceDate) as { present: number } | undefined)?.present);
    },
  };
  const recipes = {

    get(domain: string) {
      const row = db.prepare('SELECT * FROM adapter_recipes WHERE domain=?').get(domain) as Record<string, unknown> | undefined;
      return row ? {
        id: row.id as number,
        domain: row.domain as string,
        version: row.version as number,
        recipe: JSON.parse(row.recipe_json as string) as Record<string, unknown>,
        confidence: row.confidence as number,
        status: row.status as 'active' | 'draft' | 'rejected',
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      } : undefined;
    },
    save(domain: string, recipe: unknown, confidence = 0.8, status: 'active' | 'draft' | 'rejected' = 'active') {
      const time = now();
      db.prepare(`
        INSERT INTO adapter_recipes(domain, version, recipe_json, confidence, status, created_at, updated_at)
        VALUES(?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT(domain) DO UPDATE SET
          version=adapter_recipes.version + 1,
          recipe_json=excluded.recipe_json,
          confidence=excluded.confidence,
          status=excluded.status,
          updated_at=excluded.updated_at
      `).run(domain, JSON.stringify(recipe), confidence, status, time, time);
      return this.get(domain)!;
    },
    list() {
      return (db.prepare('SELECT * FROM adapter_recipes ORDER BY domain').all() as Record<string, unknown>[]).map((row) => ({
        id: row.id as number,
        domain: row.domain as string,
        version: row.version as number,
        recipe: JSON.parse(row.recipe_json as string) as Record<string, unknown>,
        confidence: row.confidence as number,
        status: row.status as 'active' | 'draft' | 'rejected',
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }));
    },
  };
  const checkpoints = {
    get(sourceId: number) {
      const row = db.prepare('SELECT * FROM source_checkpoints WHERE source_id=?').get(sourceId) as Record<string, unknown> | undefined;
      return row ? {
        sourceId: row.source_id as number,
        checkpointType: row.checkpoint_type as string,
        lastCheckpointId: row.last_checkpoint_id as string,
        itemsProcessed: row.items_processed as number,
        updatedAt: row.updated_at as string,
      } : undefined;
    },
    save(sourceId: number, checkpointType: string, lastCheckpointId: string, itemsProcessed = 0) {
      const time = now();
      db.prepare(`
        INSERT INTO source_checkpoints(source_id, checkpoint_type, last_checkpoint_id, items_processed, updated_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          checkpoint_type=excluded.checkpoint_type,
          last_checkpoint_id=excluded.last_checkpoint_id,
          items_processed=excluded.items_processed,
          updated_at=excluded.updated_at
      `).run(sourceId, checkpointType, lastCheckpointId, itemsProcessed, time);
    },
  };
  const dashboard={stats(){return{sources:(db.prepare('SELECT COUNT(*) count FROM sources').get() as {count:number}).count,runs:(db.prepare('SELECT COUNT(*) count FROM runs').get() as {count:number}).count,contacts:(db.prepare('SELECT COUNT(*) count FROM contacts WHERE merged_into_id IS NULL').get() as {count:number}).count,newContacts:(db.prepare("SELECT COUNT(*) count FROM contacts WHERE first_seen_at>=datetime('now','-1 day')").get() as {count:number}).count,errors:(db.prepare("SELECT COUNT(*) count FROM runs WHERE status='failed'").get() as {count:number}).count,active:(db.prepare("SELECT COUNT(*) count FROM runs WHERE status IN ('queued','running')").get() as {count:number}).count};}};
  return { sources, keywords, runs, contacts, evidence, reviews, audit, dashboard, binaListings, recipes, checkpoints };
}
