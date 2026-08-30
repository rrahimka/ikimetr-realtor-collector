import {
  type Classification,
  type EvidenceInput,
  type SourceInput,
  type LeadInput,
  type LeadRecord,
  type LeadType,
  type LeadStatus,
  type ConfidenceLevel,
  type OriginGroup,
  type SignalBreakdown,
  resolveOriginGroup,
} from '@ikimetr/core';
import type { CollectorDatabase } from './client';

const now = () => new Date().toISOString();
type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
type RunCounters = { pagesChecked: number; phonesFound: number; uniquePhones: number };
type BinaRunSummary = { outcomes: Record<string, number>; newContacts: number; duplicates: number; agenciesFound?: number };

export interface ContactRecord {
  id: number;
  normalizedPhone: string;
  originalPhone: string;
  isForeign: boolean;
  type: string;
  name: string | null;
  agency: string | null;
  city: string | null;
  username: string | null;
  platform: string | null;
  confidence: number;
  reasons: string[];
  signals: SignalBreakdown[];
  autoAccepted: boolean;
  autoAcceptPolicy?: string | undefined;
  verificationStatus: string;
  mergedIntoId: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  originGroups: OriginGroup[];
  evidenceCount: number;
}

export interface ReviewCandidate extends ContactRecord {
  primaryOrigin: OriginGroup;
  evidenceUrl: string;
  evidenceExcerpt: string;
  evidenceLocationType: string;
  evidenceDiscoveredAt: string;
}

export interface DashboardStats {
  sources: number;
  runs: number;
  runsToday: number;
  successfulRunsToday: number;
  failedRunsToday: number;
  contacts: number;
  newContacts: number;
  newContactsToday: number;
  newContactsLastRun: number;
  websiteContacts: number;
  socialContacts: number;
  whatsappContacts: number;
  unreviewedContacts: number;
  autoAcceptedToday: number;
  evidence: number;
  evidenceToday: number;
  enrichedContactsToday: number;
  errors: number;
  errorsToday: number;
  active: number;
  leads: number;
  newLeadsToday: number;
  activeLeads: number;
  bakuDateIso: string;
}

export function getBakuStartOfDay(targetDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(targetDate).split('-');
  return new Date(`${year}-${month}-${day}T00:00:00+04:00`).toISOString();
}

function mapSource(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as SourceInput['type'],
    locator: row.locator as string,
    language: row.language as SourceInput['language'],
    maxPages: row.max_pages as number,
    maxDepth: row.max_depth as number,
    delayMs: row.delay_ms as number,
    enabled: Boolean(row.enabled),
    killSwitch: Boolean(row.kill_switch),
    deletedAt: (row.deleted_at as string | null) || null,
  };
}

function mapRun(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    sourceId: row.source_id as number,
    status: row.status as RunStatus,
    sessionId: (row.session_id as number | null) ?? null,
    startedAt: row.started_at as string | null,
    finishedAt: row.finished_at as string | null,
    pagesChecked: row.pages_checked as number,
    phonesFound: row.phones_found as number,
    uniquePhones: row.unique_phones as number,
    error: row.error as string | null,
    cancellationRequested: Boolean(row.cancellation_requested),
    needsReview: Boolean(row.needs_review),
  };
}

function mapContact(row: Record<string, unknown>, originGroups?: OriginGroup[], evidenceCount?: number): ContactRecord {
  let reasons: string[] = [];
  let signals: SignalBreakdown[] = [];
  let autoAccepted = false;
  let autoAcceptPolicy: string | undefined = undefined;

  try {
    const parsed: unknown = JSON.parse(row.reasons_json as string);
    if (Array.isArray(parsed)) {
      reasons = parsed.filter((value): value is string => typeof value === 'string');
    } else if (parsed && typeof parsed === 'object') {
      const value = parsed as Record<string, unknown>;
      reasons = Array.isArray(value.reasons) ? value.reasons.filter((item): item is string => typeof item === 'string') : [];
      signals = Array.isArray(value.signals) ? value.signals.filter((item): item is SignalBreakdown => Boolean(item) && typeof item === 'object' && typeof (item as SignalBreakdown).key === 'string' && typeof (item as SignalBreakdown).points === 'number' && typeof (item as SignalBreakdown).label === 'string') : [];
      autoAccepted = Boolean(value.autoAccepted);
      autoAcceptPolicy = typeof value.autoAcceptPolicy === 'string' ? value.autoAcceptPolicy : undefined;
    }
  } catch {
    reasons = [];
  }

  return {
    id: row.id as number,
    normalizedPhone: row.normalized_phone as string,
    originalPhone: row.original_phone as string,
    isForeign: Boolean(row.is_foreign),
    type: row.type as string,
    name: (row.name as string | null) || null,
    agency: (row.agency as string | null) || null,
    city: (row.city as string | null) || null,
    username: (row.username as string | null) || null,
    platform: (row.platform as string | null) || null,
    confidence: Number(row.confidence),
    reasons,
    signals,
    autoAccepted,
    autoAcceptPolicy,
    verificationStatus: row.verification_status as string,
    mergedIntoId: (row.merged_into_id as number | null) || null,
    firstSeenAt: row.first_seen_at as string,
    lastSeenAt: row.last_seen_at as string,
    originGroups: originGroups && originGroups.length > 0 ? originGroups : [resolveOriginGroup(row.platform as string)],
    evidenceCount: evidenceCount ?? 0,
  };
}
function mapLead(row: Record<string, unknown>): LeadRecord {
  return {
    id: row.id as number,
    leadType: row.lead_type as LeadType,
    status: row.status as LeadStatus,
    sourcePlatform: row.source_platform as string,
    sourceSurface: row.source_surface as string,
    sourceUrl: row.source_url as string,
    externalId: (row.external_id as string | null) || null,
    username: (row.username as string | null) || null,
    displayName: (row.display_name as string | null) || null,
    publicPhone: (row.public_phone as string | null) || null,
    normalizedPhone: (row.normalized_phone as string | null) || null,
    intentExcerpt: row.intent_excerpt as string,
    city: (row.city as string | null) || null,
    district: (row.district as string | null) || null,
    metro: (row.metro as string | null) || null,
    propertyType: (row.property_type as string | null) || null,
    rooms: typeof row.rooms === 'number' ? row.rooms : null,
    budgetMin: typeof row.budget_min === 'number' ? row.budget_min : null,
    budgetMax: typeof row.budget_max === 'number' ? row.budget_max : null,
    currency: (row.currency as string) || 'AZN',
    confidence: (row.confidence as number) || 0.5,
    confidenceLevel: (row.confidence_level as ConfidenceLevel) || 'medium',
    signals: row.signals_json ? (JSON.parse(row.signals_json as string) as string[]) : [],
    parentContext: (row.parent_context as string | null) || null,
    isRealtorSender: Boolean(row.is_realtor_sender),
    firstSeenAt: row.first_seen_at as string,
    lastSeenAt: row.last_seen_at as string,
    expiresAt: row.expires_at as string,
  };
}

export function createRepositories(db: CollectorDatabase) {
  const audit = {
    record(action: string, entityType: string, entityId: number, details: unknown) { db.prepare('INSERT INTO audit_events(action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?)').run(action, entityType, entityId, JSON.stringify(details), now()); },
    list() { return (db.prepare('SELECT * FROM audit_events ORDER BY id').all() as Array<Record<string, unknown>>).map((row) => ({ id: row.id as number, action: row.action as string, entityType: row.entity_type as string, entityId: row.entity_id as number, details: JSON.parse(row.details_json as string) as unknown, createdAt: row.created_at as string })); },
  };
  const sources = {
    create(input: SourceInput) {
      const time = now();
      const result = db.prepare('INSERT INTO sources(name,type,locator,language,max_pages,max_depth,delay_ms,enabled,kill_switch,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(input.name, input.type, input.locator, input.language, input.maxPages, input.maxDepth, input.delayMs, Number(input.enabled), Number(input.killSwitch), time, time);
      return this.get(Number(result.lastInsertRowid))!;
    },
    get(id: number) {
      const row = db.prepare('SELECT * FROM sources WHERE id=?').get(id) as Record<string, unknown> | undefined;
      return row ? mapSource(row) : undefined;
    },
    list() {
      return (db.prepare('SELECT * FROM sources WHERE deleted_at IS NULL ORDER BY id DESC').all() as Record<string, unknown>[]).map(mapSource);
    },
    update(id: number, input: Partial<SourceInput>) {
      const old = this.get(id);
      if (!old) throw new Error('source not found');
      const next = { ...old, ...input };
      db.prepare('UPDATE sources SET name=?,type=?,locator=?,language=?,max_pages=?,max_depth=?,delay_ms=?,enabled=?,kill_switch=?,updated_at=? WHERE id=?').run(next.name,next.type,next.locator,next.language,next.maxPages,next.maxDepth,next.delayMs,Number(next.enabled),Number(next.killSwitch),now(),id);
      return this.get(id)!;
    },
    remove(id: number) {
      return db.transaction(() => {
        const time = now();
        const result = db.prepare('UPDATE sources SET deleted_at=?, enabled=0, kill_switch=1, updated_at=? WHERE id=? AND deleted_at IS NULL').run(time, time, id);
        if (result.changes === 0) return false;
        db.prepare("UPDATE runs SET status='cancelled', cancellation_requested=1, finished_at=COALESCE(finished_at, ?) WHERE source_id=? AND status='queued'").run(time, id);
        db.prepare("UPDATE runs SET cancellation_requested=1 WHERE source_id=? AND status='running'").run(id);
        audit.record('source.soft_delete', 'source', id, { preserved: ['contacts', 'evidence', 'runs'] });
        return true;
      })();
    },
    bulkRun(ids: number[]) {
      const enqueued: number[] = [];
      for (const id of ids) {
        if (!runs.hasActive(id)) {
          try {
            const run = runs.enqueue(id);
            enqueued.push(run.id);
          } catch { /* ignore if active */ }
        }
      }
      return enqueued;
    },
    bulkKill(ids: number[]) {
      const updated: number[] = [];
      for (const id of ids) {
        const source = this.get(id);
        if (source) {
          this.update(id, { killSwitch: !source.killSwitch });
          updated.push(id);
        }
      }
      return updated;
    },
    bulkDelete(ids: number[]) {
      let count = 0;
      for (const id of ids) {
        if (this.remove(id)) count++;
      }
      return count;
    },
  };
  const keywords = {
    create(value:string,language:'AZ'|'RU'|'EN'|'mixed'){const result=db.prepare('INSERT OR IGNORE INTO keywords(value,language,created_at) VALUES(?,?,?)').run(value.trim(),language,now());if(!result.lastInsertRowid)return db.prepare('SELECT * FROM keywords WHERE value=?').get(value.trim()) as {id:number;value:string;language:string};return{id:Number(result.lastInsertRowid),value:value.trim(),language};},
    list(){return db.prepare('SELECT * FROM keywords ORDER BY language,value').all() as Array<{id:number;value:string;language:string}>;},
    remove(id:number){return db.prepare('DELETE FROM keywords WHERE id=?').run(id).changes>0;},
  };
  const runs = {
    enqueue(sourceId: number, sessionId?: number | null) { const sourceRow=db.prepare('SELECT deleted_at FROM sources WHERE id=?').get(sourceId) as {deleted_at:string|null}|undefined; if(!sourceRow)throw new Error('source not found');if(sourceRow.deleted_at)throw new Error('source is deleted');try { const result = db.prepare("INSERT INTO runs(source_id,status,pages_checked,phones_found,unique_phones,cancellation_requested,needs_review,session_id,created_at) VALUES(?,'queued',0,0,0,0,0,?,?)").run(sourceId, sessionId ?? null, now()); return this.get(Number(result.lastInsertRowid))!; } catch (error) { if (String(error).includes('UNIQUE')) throw new Error('source already has an active run'); throw error; } },
    get(id: number) { const row = db.prepare('SELECT * FROM runs WHERE id=?').get(id) as Record<string, unknown> | undefined; return row ? mapRun(row) : undefined; },
    list() { return (db.prepare('SELECT * FROM runs ORDER BY id DESC').all() as Record<string, unknown>[]).map(mapRun); },
    hasActive(sourceId: number) { return Boolean((db.prepare("SELECT 1 present FROM runs WHERE source_id=? AND status IN ('queued','running') LIMIT 1").get(sourceId) as { present: number } | undefined)?.present); },
    latestTerminal(sourceId: number) { const row = db.prepare("SELECT * FROM runs WHERE source_id=? AND status NOT IN ('queued','running') ORDER BY COALESCE(finished_at,created_at) DESC,id DESC LIMIT 1").get(sourceId) as Record<string, unknown> | undefined; return row ? mapRun(row) : undefined; },
    claimNext() { const claim = db.transaction(() => { const row = db.prepare("SELECT r.id FROM runs r JOIN sources s ON s.id=r.source_id WHERE r.status='queued' AND s.deleted_at IS NULL AND s.enabled=1 AND s.kill_switch=0 ORDER BY r.id LIMIT 1").get() as {id:number}|undefined; if (!row) return undefined; db.prepare("UPDATE runs SET status='running',started_at=? WHERE id=? AND status='queued'").run(now(), row.id); return this.get(row.id); }); return claim(); },
    requestCancellation(id: number) { db.prepare('UPDATE runs SET cancellation_requested=1 WHERE id=?').run(id); },
    requestCancellationBySession(sessionId: number) { db.prepare("UPDATE runs SET cancellation_requested=1 WHERE session_id=? AND status IN ('queued','running')").run(sessionId); },
    shouldCancel(id: number) { return Boolean((db.prepare('SELECT cancellation_requested FROM runs WHERE id=?').get(id) as {cancellation_requested:number}|undefined)?.cancellation_requested); },
    finish(id: number, status: Exclude<RunStatus, 'queued'|'running'>, counters: RunCounters = { pagesChecked: 0, phonesFound: 0, uniquePhones: 0 }, error?: string, extra?: { newContacts?: number; duplicates?: number }) { db.prepare('UPDATE runs SET status=?,finished_at=?,pages_checked=?,phones_found=?,unique_phones=?,error=?,new_contacts=?,duplicates=? WHERE id=?').run(status,now(),counters.pagesChecked,counters.phonesFound,counters.uniquePhones,error ?? null,extra?.newContacts ?? 0,extra?.duplicates ?? 0,id); },
    finishBina(id: number, status: 'completed' | 'blocked' | 'cancelled', counters: RunCounters, reason: string | undefined, summary: BinaRunSummary) { db.transaction(() => { this.finish(id, status, counters, reason, { newContacts: summary.newContacts, duplicates: summary.duplicates }); audit.record('run.bina.summary', 'run', id, summary); })(); return this.get(id)!; },
    recoverAbandoned() { return db.prepare("UPDATE runs SET status='failed',finished_at=?,needs_review=1,error=COALESCE(error,'Worker restarted during run') WHERE status='running'").run(now()).changes; },
  };
  const contacts = {
    persistEvidence(input: { normalizedPhone: string; isForeign: boolean; evidence: EvidenceInput; classification: Classification }) {
      if (input.classification.type === 'owner' || input.classification.type === 'suspicious') {
        return undefined;
      }

      return db.transaction(() => {
        const time = now();
        const existing = this.byPhone(input.normalizedPhone);
        const origin = resolveOriginGroup(input.evidence.platform, undefined, input.evidence.sourceUrl);
        const isAutoAccept = Boolean(input.classification.autoAccept ?? input.classification.autoAccepted);

        const reasonsData = JSON.stringify({
          reasons: input.classification.reasons,
          signals: input.classification.signals ?? [],
          autoAccepted: isAutoAccept,
          autoAcceptPolicy: input.classification.autoAcceptPolicy,
        });

        let initialStatus = 'unreviewed';
        if (existing) {
          initialStatus = existing.verificationStatus;
        } else if (isAutoAccept) {
          initialStatus = 'verified';
        }

        db.prepare(`
          INSERT INTO contacts(
            normalized_phone, original_phone, is_foreign, type, name, agency, city, username, platform,
            confidence, reasons_json, rule_version, classified_at, verification_status, first_seen_at, last_seen_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(normalized_phone) DO UPDATE SET
            last_seen_at=excluded.last_seen_at,
            name=COALESCE(excluded.name, contacts.name),
            agency=COALESCE(excluded.agency, contacts.agency),
            city=COALESCE(excluded.city, contacts.city),
            username=COALESCE(excluded.username, contacts.username),
            confidence=MAX(contacts.confidence, excluded.confidence),
            reasons_json=excluded.reasons_json
        `).run(
          input.normalizedPhone,
          input.evidence.rawPhone,
          Number(input.isForeign),
          input.classification.type,
          input.evidence.name ?? null,
          input.evidence.agency ?? null,
          input.evidence.city ?? null,
          input.evidence.username ?? null,
          input.evidence.platform,
          input.classification.confidence,
          reasonsData,
          input.classification.ruleVersion,
          input.classification.classifiedAt,
          initialStatus,
          time,
          time
        );

        const contact = this.byPhone(input.normalizedPhone)!;

        db.prepare(`
          INSERT OR IGNORE INTO evidence(
            contact_id, source_id, source_url, location_type, excerpt, raw_phone, platform, fingerprint, discovered_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contact.id,
          input.evidence.sourceId,
          input.evidence.sourceUrl,
          input.evidence.locationType,
          input.evidence.excerpt,
          input.evidence.rawPhone,
          input.evidence.platform,
          input.evidence.fingerprint,
          time
        );

        if (!existing && isAutoAccept) {
          audit.record('contact.auto_accept', 'contact', contact.id, {
            phone: input.normalizedPhone,
            confidence: input.classification.confidence,
            policy: input.classification.autoAcceptPolicy,
            origin,
          });
        }

        return contact;
      })();
    },
    get(id: number) {
      const row = db.prepare('SELECT * FROM contacts WHERE id=?').get(id) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const originGroups = this.getOriginGroups(id);
      const evidenceCount = (db.prepare('SELECT COUNT(*) count FROM evidence WHERE contact_id=?').get(id) as { count: number }).count;
      return mapContact(row, originGroups, evidenceCount);
    },
    byPhone(phone: string) {
      const row = db.prepare('SELECT * FROM contacts WHERE normalized_phone=?').get(phone) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const originGroups = this.getOriginGroups(Number(row.id));
      const evidenceCount = (db.prepare('SELECT COUNT(*) count FROM evidence WHERE contact_id=?').get(row.id) as { count: number }).count;
      return mapContact(row, originGroups, evidenceCount);
    },
    getOriginGroups(contactId: number): OriginGroup[] {
      const rows = db.prepare('SELECT DISTINCT platform, source_url FROM evidence WHERE contact_id=?').all(contactId) as Array<{ platform: string; source_url: string }>;
      const groups = new Set<OriginGroup>();
      for (const r of rows) {
        groups.add(resolveOriginGroup(r.platform, undefined, r.source_url));
      }
      return groups.size > 0 ? Array.from(groups) : ['website'];
    },
    list(
      search = '',
      filters: {
        type?: string | undefined;
        platform?: string | undefined;
        origin?: OriginGroup | undefined;
        verificationStatus?: string | undefined;
        isForeign?: boolean | undefined;
        city?: string | undefined;
      } = {}
    ) {
      const clauses: string[] = [];
      const params: unknown[] = [];
      clauses.push('c.merged_into_id IS NULL');

      if (search) {
        clauses.push("(c.normalized_phone LIKE ? OR COALESCE(c.name,'') LIKE ? OR COALESCE(c.agency,'') LIKE ? OR COALESCE(c.city,'') LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (filters.type) {
        clauses.push('c.type = ?');
        params.push(filters.type);
      }
      if (filters.platform) {
        clauses.push('c.platform = ?');
        params.push(filters.platform);
      }
      if (filters.verificationStatus) {
        clauses.push('c.verification_status = ?');
        params.push(filters.verificationStatus);
      }
      if (filters.isForeign !== undefined) {
        clauses.push('c.is_foreign = ?');
        params.push(Number(filters.isForeign));
      }
      if (filters.city) {
        clauses.push('c.city LIKE ?');
        params.push(`%${filters.city}%`);
      }

      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT c.*,
          COUNT(e.id) as evidence_count,
          GROUP_CONCAT(DISTINCT e.platform || '::' || e.source_url) as evidence_summary
        FROM contacts c
        LEFT JOIN evidence e ON e.contact_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY c.id DESC
      `).all(...params) as Array<Record<string, unknown>>;

      let result = rows.map((row) => {
        const rawSummary = typeof row.evidence_summary === 'string' ? row.evidence_summary : '';
        const groups = new Set<OriginGroup>();
        if (rawSummary) {
          const entries = rawSummary.split(',');
          for (const entry of entries) {
            const [plat, surl] = entry.split('::');
            groups.add(resolveOriginGroup(plat, undefined, surl));
          }
        }
        const originGroups = groups.size > 0 ? Array.from(groups) : [resolveOriginGroup(row.platform as string)];
        return mapContact(row, originGroups, Number(row.evidence_count || 0));
      });

      if (filters.origin) {
        result = result.filter((c) => c.originGroups.includes(filters.origin!));
      }
      return result;
    },
    originCounts() {
      const all = this.list();
      return {
        total: all.length,
        website: all.filter((c) => c.originGroups.includes('website')).length,
        social: all.filter((c) => c.originGroups.includes('social')).length,
        whatsapp: all.filter((c) => c.originGroups.includes('whatsapp')).length,
        unreviewed: all.filter((c) => c.verificationStatus === 'unreviewed').length,
        verified: all.filter((c) => c.verificationStatus === 'verified').length,
      };
    },
    evidenceFor(phone: string) {
      return db.prepare('SELECT e.* FROM evidence e JOIN contacts c ON c.id=e.contact_id WHERE c.normalized_phone=? ORDER BY e.id').all(phone) as Array<Record<string, unknown>>;
    },
  };
  const evidence = {
    wasUrlSeenSince(sourceId: number, sourceUrl: string, since: string) { return Boolean((db.prepare('SELECT 1 present FROM evidence WHERE source_id=? AND source_url=? AND discovered_at>=? LIMIT 1').get(sourceId, sourceUrl, since) as { present: number } | undefined)?.present); },
  };
  const reviews = {
    merge(targetId:number,sourceId:number,reason:string) { return db.transaction(() => { if (targetId===sourceId) throw new Error('cannot merge a contact into itself'); const result=db.prepare('INSERT INTO contact_merges(target_contact_id,source_contact_id,reason,merged_at) VALUES(?,?,?,?)').run(targetId,sourceId,reason,now()); db.prepare('UPDATE contacts SET merged_into_id=? WHERE id=?').run(targetId,sourceId); const id=Number(result.lastInsertRowid); audit.record('contact.merge','contact',sourceId,{targetId,reason}); return {id,targetId,sourceId}; })(); },
    undoMerge(id:number,reason:string) { return db.transaction(() => { const merge=db.prepare('SELECT * FROM contact_merges WHERE id=? AND undone_at IS NULL').get(id) as {source_contact_id:number}|undefined; if(!merge) throw new Error('active merge not found'); db.prepare('UPDATE contacts SET merged_into_id=NULL WHERE id=?').run(merge.source_contact_id); db.prepare('UPDATE contact_merges SET undone_at=?,undo_reason=? WHERE id=?').run(now(),reason,id); audit.record('contact.merge.undo','contact',merge.source_contact_id,{mergeId:id,reason}); })(); },
    setStatus(contactId:number,status:'verified'|'rejected'|'unreviewed'){
      if(!contacts.get(contactId))throw new Error('contact not found');
      db.prepare('UPDATE contacts SET verification_status=? WHERE id=?').run(status,contactId);
      audit.record(`contact.${status}`,'contact',contactId,{status});
      return contacts.get(contactId)!;
    },
    confirm(contactId: number) {
      return this.setStatus(contactId, 'verified');
    },
    reject(contactId: number) {
      return this.setStatus(contactId, 'rejected');
    },
    listMerges(){return db.prepare('SELECT * FROM contact_merges ORDER BY id DESC').all() as Array<Record<string,unknown>>;},
    pendingCount() {
      const row = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE verification_status = 'unreviewed' AND merged_into_id IS NULL").get() as { count: number };
      return row.count;
    },
    listPending(filters: { origin?: OriginGroup; confidenceTier?: 'gte90' | '70-89' | 'lt70' } = {}): ReviewCandidate[] {
      const rows = db.prepare(`
        SELECT c.*,
          e.id as evidence_id,
          e.source_url as evidence_url,
          e.location_type as evidence_location_type,
          e.excerpt as evidence_excerpt,
          e.platform as evidence_platform,
          e.discovered_at as evidence_discovered_at,
          COUNT(e_all.id) as evidence_count,
          GROUP_CONCAT(DISTINCT e_all.platform || '::' || e_all.source_url) as evidence_summary
        FROM contacts c
        LEFT JOIN evidence e ON e.id = (SELECT id FROM evidence WHERE contact_id = c.id ORDER BY id DESC LIMIT 1)
        LEFT JOIN evidence e_all ON e_all.contact_id = c.id
        WHERE c.verification_status = 'unreviewed' AND c.merged_into_id IS NULL
        GROUP BY c.id
        ORDER BY c.confidence DESC, c.id DESC
      `).all() as Array<Record<string, unknown>>;

      let mapped = rows.map((row) => {
        const rawSummary = typeof row.evidence_summary === 'string' ? row.evidence_summary : '';
        const groups = new Set<OriginGroup>();
        if (rawSummary) {
          const entries = rawSummary.split(',');
          for (const entry of entries) {
            const [plat, surl] = entry.split('::');
            groups.add(resolveOriginGroup(plat, undefined, surl));
          }
        }
        const primaryOrigin = resolveOriginGroup(
          (row.evidence_platform as string) || (row.platform as string),
          undefined,
          (row.evidence_url as string)
        );
        groups.add(primaryOrigin);

        const contact = mapContact(row, Array.from(groups), Number(row.evidence_count || 1));
        return {
          ...contact,
          primaryOrigin,
          evidenceUrl: (row.evidence_url as string) || (contact.platform ? `https://${contact.platform}` : '#'),
          evidenceExcerpt: (row.evidence_excerpt as string) || '',
          evidenceLocationType: (row.evidence_location_type as string) || 'listing',
          evidenceDiscoveredAt: (row.evidence_discovered_at as string) || contact.firstSeenAt,
        };
      });

      if (filters.origin) {
        mapped = mapped.filter((item) => item.originGroups.includes(filters.origin!) || item.primaryOrigin === filters.origin);
      }
      if (filters.confidenceTier) {
        if (filters.confidenceTier === 'gte90') {
          mapped = mapped.filter((item) => item.confidence >= 0.90);
        } else if (filters.confidenceTier === '70-89') {
          mapped = mapped.filter((item) => item.confidence >= 0.70 && item.confidence < 0.90);
        } else if (filters.confidenceTier === 'lt70') {
          mapped = mapped.filter((item) => item.confidence < 0.70);
        }
      }

      return mapped;
    },
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
  type SessionStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  type CollectorSession = {
    id: number;
    status: SessionStatus;
    startedAt: string | null;
    startedBy: string | null;
    lastHeartbeatAt: string | null;
    stoppedAt: string | null;
    stopReason: string | null;
    activeSources: number[];
    counters: Record<string, number>;
    error: string | null;
  };
  type CollectorCounters = {
    pagesChecked: number;
    discoveredListings: number;
    uniquePhones: number;
    newContacts: number;
    duplicates: number;
    errors: number;
    runsTotal: number;
    runsCompleted: number;
    currentSourceId: number | null;
  };

  const mapSession = (row: Record<string, unknown>): CollectorSession => {
    let activeSources: number[] = [];
    try {
      const parsed = JSON.parse((row.active_sources_json as string) || '[]') as unknown;
      if (Array.isArray(parsed)) activeSources = parsed.filter((v): v is number => typeof v === 'number');
    } catch { /* ignore */ }
    let counters: Record<string, number> = {};
    try {
      const parsed = JSON.parse((row.counters_json as string) || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) counters = parsed as Record<string, number>;
    } catch { /* ignore */ }
    return {
      id: row.id as number,
      status: row.status as SessionStatus,
      startedAt: (row.started_at as string | null) || null,
      startedBy: (row.started_by as string | null) || null,
      lastHeartbeatAt: (row.last_heartbeat_at as string | null) || null,
      stoppedAt: (row.stopped_at as string | null) || null,
      stopReason: (row.stop_reason as string | null) || null,
      activeSources,
      counters,
      error: (row.error as string | null) || null,
    };
  };

  const collectorSessions = {
    create(startedBy = 'web') {
      const time = now();
      const result = db.prepare("INSERT INTO collector_sessions(status,started_at,started_by,last_heartbeat_at,active_sources_json,counters_json) VALUES('running',?,?,?,?,?)").run(time, startedBy, time, '[]', '{}');
      return this.get(Number(result.lastInsertRowid))!;
    },
    get(id: number) {
      const row = db.prepare('SELECT * FROM collector_sessions WHERE id=?').get(id) as Record<string, unknown> | undefined;
      return row ? mapSession(row) : undefined;
    },
    getActive() {
      const row = db.prepare("SELECT * FROM collector_sessions WHERE status IN ('starting','running') ORDER BY id DESC LIMIT 1").get() as Record<string, unknown> | undefined;
      return row ? mapSession(row) : undefined;
    },
    heartbeat(id: number) {
      db.prepare('UPDATE collector_sessions SET last_heartbeat_at=? WHERE id=?').run(now(), id);
      return this.get(id);
    },
    setStatus(id: number, status: SessionStatus) {
      db.prepare('UPDATE collector_sessions SET status=? WHERE id=?').run(status, id);
    },
    markStopped(id: number, reason: string) {
      db.prepare("UPDATE collector_sessions SET status='stopped', stopped_at=?, stop_reason=? WHERE id=?").run(now(), reason, id);
      return this.get(id);
    },
    markError(id: number, error: string) {
      db.prepare("UPDATE collector_sessions SET status='error', error=? WHERE id=?").run(error, id);
      return this.get(id);
    },
    setActiveSources(id: number, sourceIds: number[]) {
      db.prepare('UPDATE collector_sessions SET active_sources_json=? WHERE id=?').run(JSON.stringify(sourceIds), id);
    },
    setCounters(id: number, counters: Record<string, number>) {
      db.prepare('UPDATE collector_sessions SET counters_json=? WHERE id=?').run(JSON.stringify(counters), id);
    },
    computeCounters(id: number): CollectorCounters {
      const rows = db.prepare("SELECT status, pages_checked, phones_found, unique_phones, new_contacts, duplicates FROM runs WHERE session_id=?").all(id) as Array<Record<string, unknown>>;
      const counters: CollectorCounters = {
        pagesChecked: 0,
        discoveredListings: 0,
        uniquePhones: 0,
        newContacts: 0,
        duplicates: 0,
        errors: 0,
        runsTotal: rows.length,
        runsCompleted: 0,
        currentSourceId: null,
      };
      for (const row of rows) {
        counters.pagesChecked += Number(row.pages_checked || 0);
        counters.discoveredListings += Number(row.phones_found || 0);
        counters.uniquePhones += Number(row.unique_phones || 0);
        counters.newContacts += Number(row.new_contacts || 0);
        counters.duplicates += Number(row.duplicates || 0);
        if (row.status === 'failed') counters.errors += 1;
        if (row.status === 'completed' || row.status === 'blocked' || row.status === 'cancelled') counters.runsCompleted += 1;
      }
      const running = db.prepare("SELECT source_id FROM runs WHERE session_id=? AND status='running' ORDER BY id DESC LIMIT 1").get(id) as { source_id: number } | undefined;
      counters.currentSourceId = running ? running.source_id : null;
      return counters;
    },
  };

  const leads = {
    create(input: LeadInput): { lead: LeadRecord; isNew: boolean } {
      const time = now();
      const expiresAt = input.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Check dedup: same normalizedPhone or same (sourcePlatform + username) with same leadType
      let existingId: number | undefined;
      if (input.normalizedPhone) {
        const row = db.prepare('SELECT id FROM leads WHERE normalized_phone=? AND lead_type=? LIMIT 1')
          .get(input.normalizedPhone, input.leadType) as { id: number } | undefined;
        if (row) existingId = row.id;
      }
      if (!existingId && input.username && input.sourcePlatform) {
        const row = db.prepare('SELECT id FROM leads WHERE source_platform=? AND username=? AND lead_type=? LIMIT 1')
          .get(input.sourcePlatform, input.username, input.leadType) as { id: number } | undefined;
        if (row) existingId = row.id;
      }

      if (existingId) {
        db.prepare(`
          UPDATE leads SET
            last_seen_at = ?,
            intent_excerpt = ?,
            confidence = MAX(confidence, ?),
            confidence_level = CASE WHEN ? >= 0.75 THEN 'high' WHEN ? >= 0.45 THEN 'medium' ELSE 'low' END,
            signals_json = ?,
            expires_at = ?,
            budget_max = COALESCE(?, budget_max),
            budget_min = COALESCE(?, budget_min),
            rooms = COALESCE(?, rooms),
            property_type = COALESCE(?, property_type),
            district = COALESCE(?, district),
            metro = COALESCE(?, metro)
          WHERE id = ?
        `).run(
          time,
          input.intentExcerpt,
          input.confidence || 0.5,
          input.confidence || 0.5,
          input.confidence || 0.5,
          JSON.stringify(input.signals || []),
          expiresAt,
          input.budgetMax ?? null,
          input.budgetMin ?? null,
          input.rooms ?? null,
          input.propertyType ?? null,
          input.district ?? null,
          input.metro ?? null,
          existingId
        );
        return { lead: this.get(existingId)!, isNew: false };
      }

      const result = db.prepare(`
        INSERT INTO leads(
          lead_type, status, source_platform, source_surface, source_url,
          external_id, username, display_name, public_phone, normalized_phone,
          intent_excerpt, city, district, metro, property_type, rooms,
          budget_min, budget_max, currency, confidence, confidence_level,
          signals_json, parent_context, is_realtor_sender,
          first_seen_at, last_seen_at, expires_at
        ) VALUES(
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `).run(
        input.leadType,
        input.status || 'new',
        input.sourcePlatform,
        input.sourceSurface,
        input.sourceUrl,
        input.externalId ?? null,
        input.username ?? null,
        input.displayName ?? null,
        input.publicPhone ?? null,
        input.normalizedPhone ?? null,
        input.intentExcerpt,
        input.city ?? null,
        input.district ?? null,
        input.metro ?? null,
        input.propertyType ?? null,
        input.rooms ?? null,
        input.budgetMin ?? null,
        input.budgetMax ?? null,
        input.currency || 'AZN',
        input.confidence ?? 0.5,
        input.confidenceLevel || 'medium',
        JSON.stringify(input.signals || []),
        input.parentContext ?? null,
        Number(Boolean(input.isRealtorSender)),
        input.firstSeenAt || time,
        input.lastSeenAt || time,
        expiresAt
      );

      return { lead: this.get(Number(result.lastInsertRowid))!, isNew: true };
    },

    get(id: number) {
      const row = db.prepare('SELECT * FROM leads WHERE id=?').get(id) as Record<string, unknown> | undefined;
      return row ? mapLead(row) : undefined;
    },

    list(filters?: {
      leadType?: string | undefined;
      status?: string | undefined;
      confidenceLevel?: string | undefined;
      sourcePlatform?: string | undefined;
      search?: string | undefined;
      minConfidence?: number | undefined;
    }) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters?.leadType && filters.leadType !== 'all') {
        conditions.push('lead_type = ?');
        params.push(filters.leadType);
      }
      if (filters?.status && filters.status !== 'all') {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters?.confidenceLevel && filters.confidenceLevel !== 'all') {
        conditions.push('confidence_level = ?');
        params.push(filters.confidenceLevel);
      }
      if (filters?.sourcePlatform && filters.sourcePlatform !== 'all') {
        conditions.push('source_platform = ?');
        params.push(filters.sourcePlatform);
      }
      if (filters?.minConfidence) {
        conditions.push('confidence >= ?');
        params.push(filters.minConfidence);
      }
      if (filters?.search) {
        conditions.push('(username LIKE ? OR display_name LIKE ? OR intent_excerpt LIKE ? OR district LIKE ? OR city LIKE ?)');
        const s = `%${filters.search}%`;
        params.push(s, s, s, s, s);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db.prepare(`SELECT * FROM leads ${whereClause} ORDER BY id DESC`).all(...params) as Record<string, unknown>[];
      return rows.map(mapLead);
    },

    updateStatus(id: number, status: LeadStatus) {
      db.prepare('UPDATE leads SET status=? WHERE id=?').run(status, id);
      return this.get(id)!;
    },

    stats() {
      const total = (db.prepare('SELECT COUNT(*) count FROM leads').get() as { count: number }).count;
      const active = (db.prepare("SELECT COUNT(*) count FROM leads WHERE status IN ('new','qualified','needs_review')").get() as { count: number }).count;
      const buyers = (db.prepare("SELECT COUNT(*) count FROM leads WHERE lead_type='buyer'").get() as { count: number }).count;
      const sellers = (db.prepare("SELECT COUNT(*) count FROM leads WHERE lead_type='seller'").get() as { count: number }).count;
      const renters = (db.prepare("SELECT COUNT(*) count FROM leads WHERE lead_type='renter'").get() as { count: number }).count;
      const landlords = (db.prepare("SELECT COUNT(*) count FROM leads WHERE lead_type='landlord'").get() as { count: number }).count;
      const investors = (db.prepare("SELECT COUNT(*) count FROM leads WHERE lead_type='investor'").get() as { count: number }).count;
      const realtorRequests = (db.prepare("SELECT COUNT(*) count FROM leads WHERE lead_type='realtor_request'").get() as { count: number }).count;
      const highConfidence = (db.prepare("SELECT COUNT(*) count FROM leads WHERE confidence_level='high'").get() as { count: number }).count;
      const today = (db.prepare("SELECT COUNT(*) count FROM leads WHERE first_seen_at >= datetime('now','-1 day')").get() as { count: number }).count;

      return {
        total,
        active,
        buyers,
        sellers,
        renters,
        landlords,
        investors,
        realtorRequests,
        highConfidence,
        today,
      };
    },

    exportRows(filters?: { leadType?: string; status?: string }) {
      return this.list(filters);
    },
  };
  const dashboard = {
    stats(targetDate: Date = new Date()): DashboardStats {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Baku',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const [year, month, day] = formatter.format(targetDate).split('-');
      const bakuStartIso = new Date(`${year}-${month}-${day}T00:00:00+04:00`).toISOString();

      const sourcesTotal = (db.prepare('SELECT COUNT(*) count FROM sources WHERE deleted_at IS NULL').get() as { count: number }).count;
      const runsTotal = (db.prepare('SELECT COUNT(*) count FROM runs').get() as { count: number }).count;
      const contactsTotal = (db.prepare('SELECT COUNT(*) count FROM contacts WHERE merged_into_id IS NULL').get() as { count: number }).count;
      const newContactsToday = (db.prepare('SELECT COUNT(*) count FROM contacts WHERE merged_into_id IS NULL AND first_seen_at >= ?').get(bakuStartIso) as { count: number }).count;

      const originCounts = contacts.originCounts();
      const unreviewedContacts = originCounts.unreviewed;
      const autoAcceptedToday = (db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action = 'contact.auto_accept' AND created_at >= ?").get(bakuStartIso) as { count: number }).count;

      const lastCompletedRun = db.prepare("SELECT * FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1").get() as { id: number; started_at: string; finished_at: string } | undefined;
      let newContactsLastRun = 0;
      if (lastCompletedRun) {
        newContactsLastRun = (db.prepare('SELECT COUNT(*) count FROM contacts WHERE merged_into_id IS NULL AND first_seen_at >= ? AND first_seen_at <= ?').get(lastCompletedRun.started_at, lastCompletedRun.finished_at || lastCompletedRun.started_at) as { count: number }).count;
      }

      const evidenceTotal = (db.prepare('SELECT COUNT(*) count FROM evidence').get() as { count: number }).count;
      const evidenceToday = (db.prepare('SELECT COUNT(*) count FROM evidence WHERE discovered_at >= ?').get(bakuStartIso) as { count: number }).count;
      const enrichedContactsToday = (db.prepare('SELECT COUNT(DISTINCT contact_id) count FROM evidence WHERE discovered_at >= ? AND contact_id IN (SELECT id FROM contacts WHERE first_seen_at < ?)').get(bakuStartIso, bakuStartIso) as { count: number }).count;

      const leadsTotal = (db.prepare('SELECT COUNT(*) count FROM leads').get() as { count: number }).count;
      const newLeadsToday = (db.prepare('SELECT COUNT(*) count FROM leads WHERE first_seen_at >= ?').get(bakuStartIso) as { count: number }).count;
      const activeLeads = (db.prepare("SELECT COUNT(*) count FROM leads WHERE status IN ('new','qualified','needs_review')").get() as { count: number }).count;

      const runsToday = (db.prepare('SELECT COUNT(*) count FROM runs WHERE created_at >= ? OR started_at >= ?').get(bakuStartIso, bakuStartIso) as { count: number }).count;
      const successfulRunsToday = (db.prepare("SELECT COUNT(*) count FROM runs WHERE status = 'completed' AND (finished_at >= ? OR started_at >= ?)").get(bakuStartIso, bakuStartIso) as { count: number }).count;
      const failedRunsToday = (db.prepare("SELECT COUNT(*) count FROM runs WHERE status = 'failed' AND (finished_at >= ? OR started_at >= ?)").get(bakuStartIso, bakuStartIso) as { count: number }).count;
      const activeRuns = (db.prepare("SELECT COUNT(*) count FROM runs WHERE status IN ('queued','running')").get() as { count: number }).count;
      const errors = (db.prepare("SELECT COUNT(*) count FROM runs WHERE status='failed'").get() as { count: number }).count;

      return {
        sources: sourcesTotal,
        runs: runsTotal,
        runsToday,
        successfulRunsToday,
        failedRunsToday,
        contacts: contactsTotal,
        newContacts: newContactsToday,
        newContactsToday,
        newContactsLastRun,
        websiteContacts: originCounts.website,
        socialContacts: originCounts.social,
        whatsappContacts: originCounts.whatsapp,
        unreviewedContacts,
        autoAcceptedToday,
        evidence: evidenceTotal,
        evidenceToday,
        enrichedContactsToday,
        errors,
        errorsToday: failedRunsToday,
        active: activeRuns,
        leads: leadsTotal,
        newLeadsToday,
        activeLeads,
        bakuDateIso: bakuStartIso,
      };
    },
  };
  return { sources, keywords, runs, contacts, evidence, reviews, audit, dashboard, binaListings, recipes, checkpoints, collectorSessions, leads };
}
