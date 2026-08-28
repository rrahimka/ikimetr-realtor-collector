import { createHash } from 'node:crypto';
import {
  extractPhones,
  isForeignRealEstatePhone,
  classifyLeadIntent,
  type LeadInput,
  type SearchSurface,
  type WhatsAppGroupData,
  isRealtorGroupContext,
} from '@ikimetr/core';
import type { ConnectorEvidence } from './types';

export interface WhatsAppAuthorizedMessage {
  id: string;
  groupId: string;
  groupTitle: string;
  isPrivateDm?: boolean;
  senderId?: string;
  senderPhone?: string; // Legitimate visible phone of sender
  senderDisplayName?: string;
  text: string;
  date: string; // ISO 8601
  replyToMessageId?: string;
  replyToText?: string;
  mediaUrl?: string;
}

export interface WhatsAppAuthorizedParticipant {
  id: string;
  phoneNumber?: string; // Visible phone number
  displayName?: string;
  isAdmin?: boolean;
}

export interface WhatsAppScanOptions {
  sourceId?: number;
  knownRealtorPhones?: Set<string>;
  checkpointDate?: string;
}

export interface WhatsAppAuthorizedScanResult {
  scannedCount: number;
  realtorEvidence: ConnectorEvidence[];
  leadCandidates: LeadInput[];
  skippedPrivateDmCount: number;
  skippedUnapprovedCount: number;
  skippedUnrelatedCount: number;
  participantCandidatesCount: number;
}

/**
 * Validates whether a message is strictly permitted for processing.
 * Strictly rejects any private 1-to-1 direct messages.
 */
export function isPermittedWhatsAppMessage(
  msg: WhatsAppAuthorizedMessage,
  group: WhatsAppGroupData
): boolean {
  // 1. Strictly prohibit private 1-to-1 DMs
  if (msg.isPrivateDm || !msg.groupId) {
    return false;
  }
  // 2. Strictly require explicit user group consent
  if (!group.authorized) {
    return false;
  }
  return true;
}

/**
 * Aggregates messages from the same sender in the same group within a 15-minute window.
 */
export function aggregateWhatsAppMessages(
  messages: WhatsAppAuthorizedMessage[],
  group: WhatsAppGroupData,
  windowMinutes = 15
): WhatsAppAuthorizedMessage[] {
  const permitted = messages.filter((m) => isPermittedWhatsAppMessage(m, group));
  const sorted = [...permitted].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const aggregated: WhatsAppAuthorizedMessage[] = [];
  const senderMap = new Map<string, WhatsAppAuthorizedMessage>();

  for (const msg of sorted) {
    const senderKey = `${msg.groupId}:${msg.senderPhone || msg.senderId || 'unknown'}`;
    const prev = senderMap.get(senderKey);

    if (prev) {
      const timeDiffMs = Math.abs(new Date(msg.date).getTime() - new Date(prev.date).getTime());
      const windowMs = windowMinutes * 60 * 1000;

      if (timeDiffMs <= windowMs) {
        prev.text = `${prev.text}\n${msg.text}`.trim();
        prev.date = msg.date;
        continue;
      }
    }

    const copy = { ...msg };
    senderMap.set(senderKey, copy);
    aggregated.push(copy);
  }

  return aggregated;
}

/**
 * Scans an authorized WhatsApp group's messages and participants.
 */
export function scanWhatsAppAuthorizedGroup(
  messages: WhatsAppAuthorizedMessage[],
  group: WhatsAppGroupData,
  participants: WhatsAppAuthorizedParticipant[] = [],
  options: WhatsAppScanOptions = {}
): WhatsAppAuthorizedScanResult {
  // If group is unapproved, strictly process 0
  if (!group.authorized) {
    return {
      scannedCount: 0,
      realtorEvidence: [],
      leadCandidates: [],
      skippedPrivateDmCount: 0,
      skippedUnapprovedCount: messages.length,
      skippedUnrelatedCount: 0,
      participantCandidatesCount: 0,
    };
  }

  let skippedPrivateDmCount = 0;
  let skippedUnapprovedCount = 0;
  let skippedUnrelatedCount = 0;
  let participantCandidatesCount = 0;

  const realtorEvidence: ConnectorEvidence[] = [];
  const leadCandidates: LeadInput[] = [];

  // Filter and tally private DMs
  for (const msg of messages) {
    if (msg.isPrivateDm) {
      skippedPrivateDmCount++;
    } else if (!group.authorized) {
      skippedUnapprovedCount++;
    }
  }

  const aggregated = aggregateWhatsAppMessages(messages, group);

  // 1. Process Messages for Leads & Realtor Intent
  for (const msg of aggregated) {
    // If checkpoint is set, skip older messages
    if (options.checkpointDate && new Date(msg.date) <= new Date(options.checkpointDate)) {
      continue;
    }

    const fullText = msg.text;
    const parentContext = msg.replyToText;
    const extracted = extractPhones(fullText);
    const validExtractedPhone = extracted[0]?.normalized;

    // Sender's legitimate visible phone or phone from message text
    const senderExtracted = msg.senderPhone ? extractPhones(msg.senderPhone)[0]?.normalized : undefined;
    const effectivePhone = validExtractedPhone || senderExtracted;

    // A. Lead Intelligence
    if (group.searchMode === 'leads' || group.searchMode === 'both') {
      const leadClassification = classifyLeadIntent(fullText, {
        parentContext,
        senderPhone: effectivePhone,
        knownRealtorPhones: options.knownRealtorPhones,
      });

      if (leadClassification.isLead) {
        const surface: SearchSurface = msg.replyToMessageId ? 'replies' : 'message_text';
        const url = `whatsapp://group/${group.id}?msg=${msg.id}`;

        leadCandidates.push({
          leadType: leadClassification.leadType,
          status: 'new',
          sourcePlatform: 'whatsapp',
          sourceSurface: surface,
          sourceUrl: url,
          externalId: msg.id,
          username: msg.senderId || null,
          displayName: msg.senderDisplayName || null,
          publicPhone: extracted[0]?.raw || msg.senderPhone || null,
          normalizedPhone: effectivePhone || null,
          intentExcerpt: leadClassification.intentExcerpt,
          city: leadClassification.city || null,
          district: leadClassification.district || null,
          metro: leadClassification.metro || null,
          propertyType: leadClassification.propertyType || null,
          rooms: leadClassification.rooms || null,
          budgetMin: leadClassification.budgetMin || null,
          budgetMax: leadClassification.budgetMax || null,
          currency: leadClassification.currency,
          confidence: leadClassification.confidence,
          confidenceLevel: leadClassification.confidenceLevel,
          signals: leadClassification.signals,
          parentContext: parentContext || null,
          isRealtorSender: leadClassification.isRealtorSender,
          firstSeenAt: msg.date,
          lastSeenAt: msg.date,
        });
      } else {
        skippedUnrelatedCount++;
      }
    }

    // B. Realtor Intelligence from Message Content
    if (group.searchMode === 'realtors' || group.searchMode === 'both') {
      if (effectivePhone && !isForeignRealEstatePhone(effectivePhone)) {
        const lower = fullText.toLowerCase();
        const isRealtorSignal =
          lower.includes('makler') ||
          lower.includes('agent') ||
          lower.includes('emlak') ||
          lower.includes('rieltor') ||
          lower.includes('agentlik') ||
          lower.includes('alqi-satqi') ||
          lower.includes('kiraye') ||
          group.isRealtorOnlyGroup;

        const isOwnerOnly =
          lower.includes('oz evim') ||
          lower.includes('öz evim') ||
          lower.includes('sahibinden') ||
          lower.includes('sahibindən') ||
          lower.includes('maklerler narahat') ||
          lower.includes('maklerlər narahat');

        if (isRealtorSignal && !isOwnerOnly) {
          const fingerprint = createHash('sha256')
            .update(`wa:${group.id}:${msg.id}:${effectivePhone}`)
            .digest('hex')
            .slice(0, 32);

          realtorEvidence.push({
            sourceUrl: `whatsapp://group/${group.id}?msg=${msg.id}`,
            locationType: 'comment',
            excerpt: fullText.slice(0, 300).trim(),
            rawPhone: extracted[0]?.raw || msg.senderPhone || effectivePhone,
            platform: 'whatsapp',
            fingerprint,
            name: msg.senderDisplayName || undefined,
            explicitSellerType: 'agency',
            whatsappContext: { approved: group.authorized, realtorOnly: group.isRealtorOnlyGroup },
          });
        }
      }
    }
  }

  // 2. Process Legitimate Visible Participants (Only in Verified Realtor-Only Groups)
  if (
    group.isRealtorOnlyGroup &&
    isRealtorGroupContext(group.name, group.description) &&
    (group.searchMode === 'realtors' || group.searchMode === 'both')
  ) {
    for (const participant of participants) {
      if (!participant.phoneNumber) continue;
      const extractedList = extractPhones(participant.phoneNumber);
      const normalized = extractedList[0]?.normalized;

      if (normalized && !isForeignRealEstatePhone(normalized)) {
        participantCandidatesCount++;
        const fingerprint = createHash('sha256')
          .update(`wa-participant:${group.id}:${normalized}`)
          .digest('hex')
          .slice(0, 32);

        realtorEvidence.push({
          sourceUrl: `whatsapp://group/${group.id}#member=${normalized}`,
          locationType: 'profile',
          excerpt: `Участник риелторской группы "${group.name}"`,
          rawPhone: participant.phoneNumber,
          platform: 'whatsapp',
          fingerprint,
          name: participant.displayName || undefined,
          explicitSellerType: 'agency',
          whatsappContext: { approved: group.authorized, realtorOnly: group.isRealtorOnlyGroup },
        });
      }
    }
  }

  return {
    scannedCount: messages.length + participantCandidatesCount,
    realtorEvidence,
    leadCandidates,
    skippedPrivateDmCount,
    skippedUnapprovedCount,
    skippedUnrelatedCount,
    participantCandidatesCount,
  };
}
