import { createHash } from 'node:crypto';
import {
  extractPhones,
  isForeignRealEstatePhone,
  classifyLeadIntent,
  type LeadInput,
  type SearchSurface,
} from '@ikimetr/core';
import type { ConnectorEvidence } from './types';

export interface TelegramAuthorizedMessage {
  id: number | string;
  chatId: number | string;
  chatTitle?: string;
  chatType: 'channel' | 'supergroup' | 'group' | 'chat';
  isPrivateDm?: boolean;
  senderId?: number | string;
  senderUsername?: string;
  senderDisplayName?: string;
  senderPhone?: string;
  text: string;
  date: string; // ISO 8601
  replyToMessageId?: number | string;
  replyToText?: string;
  permalink?: string;
}

export interface TelegramAuthorizedSessionConfig {
  apiId?: number;
  apiHash?: string;
  sessionString?: string;
  authorizedPhone?: string;
  joinedGroupIds?: (number | string)[];
}

export interface TelegramAuthorizedScanResult {
  scannedCount: number;
  realtorEvidence: ConnectorEvidence[];
  leadCandidates: LeadInput[];
  skippedPrivateDmCount: number;
  skippedUnrelatedCount: number;
  aggregatedGroupMessages: number;
}

/**
 * Checks if a chat/message is strictly permitted under authorized scope.
 * Prohibits private DMs and secret chats.
 */
export function isPermittedTelegramAuthorizedMessage(msg: TelegramAuthorizedMessage): boolean {
  if (msg.isPrivateDm || msg.chatType === 'chat') {
    return false; // Strictly reject private DMs
  }
  return true;
}

/**
 * Aggregates multi-message sequences from the same sender in the same chat within a short window.
 */
export function aggregateTelegramMessages(
  messages: TelegramAuthorizedMessage[],
  windowMinutes = 15
): TelegramAuthorizedMessage[] {
  const permitted = messages.filter(isPermittedTelegramAuthorizedMessage);
  // Sort chronologically
  const sorted = [...permitted].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const aggregated: TelegramAuthorizedMessage[] = [];
  const senderMap = new Map<string, TelegramAuthorizedMessage>();

  for (const msg of sorted) {
    const senderKey = `${msg.chatId}:${msg.senderUsername || msg.senderId || 'unknown'}`;
    const prev = senderMap.get(senderKey);

    if (prev) {
      const timeDiffMs = Math.abs(new Date(msg.date).getTime() - new Date(prev.date).getTime());
      const windowMs = windowMinutes * 60 * 1000;

      if (timeDiffMs <= windowMs) {
        // Aggregate text
        prev.text = `${prev.text}\n${msg.text}`.trim();
        prev.date = msg.date;
        if (msg.permalink) prev.permalink = msg.permalink;
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
 * Scans authorized Telegram messages and extracts both Realtor Evidence and Client Leads.
 */
export function scanTelegramAuthorizedMessages(
  messages: TelegramAuthorizedMessage[],
  options: {
    sourceId?: number;
    knownRealtorPhones?: Set<string>;
  } = {}
): TelegramAuthorizedScanResult {
  const aggregated = aggregateTelegramMessages(messages);

  let skippedPrivateDm = 0;
  let skippedUnrelated = 0;
  const realtorEvidence: ConnectorEvidence[] = [];
  const leadCandidates: LeadInput[] = [];

  for (const rawMsg of messages) {
    if (!isPermittedTelegramAuthorizedMessage(rawMsg)) {
      skippedPrivateDm++;
    }
  }

  for (const msg of aggregated) {
    const fullText = msg.text;
    const parentContext = msg.replyToText;
    const phones = extractPhones(fullText);
    const validPhone = phones[0]?.normalized;

    // 1. Check Lead Intent
    const leadClassification = classifyLeadIntent(fullText, {
      parentContext,
      senderPhone: validPhone,
      knownRealtorPhones: options.knownRealtorPhones,
    });

    if (leadClassification.isLead) {
      const surface: SearchSurface = msg.replyToMessageId ? 'replies' : 'message_text';
      const permalink = msg.permalink || `https://t.me/c/${String(msg.chatId).replace(/^-100/, '')}/${msg.id}`;

      leadCandidates.push({
        leadType: leadClassification.leadType,
        status: 'new',
        sourcePlatform: 'telegram',
        sourceSurface: surface,
        sourceUrl: permalink,
        externalId: String(msg.id),
        username: msg.senderUsername || null,
        displayName: msg.senderDisplayName || null,
        publicPhone: phones[0]?.raw || null,
        normalizedPhone: validPhone || null,
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
      skippedUnrelated++;
    }

    // 2. Check Professional Realtor Evidence (if valid phone and professional signals)
    if (validPhone && !isForeignRealEstatePhone(validPhone)) {
      const lower = fullText.toLowerCase();
      const isRealtor = lower.includes('makler') || lower.includes('agent') || lower.includes('emlak') ||
                        lower.includes('rieltor') || lower.includes('agentlik') || lower.includes('agency');
      const isOwnerOnly = lower.includes('oz evim') || lower.includes('öz evim') ||
                          lower.includes('sahibinden') || lower.includes('sahibindən') ||
                          lower.includes('maklerler narahat') || lower.includes('maklerlər narahat');

      if (isRealtor && !isOwnerOnly) {
        const fingerprint = createHash('sha256')
          .update(`tg-auth:${msg.chatId}:${msg.id}:${validPhone}`)
          .digest('hex')
          .slice(0, 32);

        realtorEvidence.push({
          sourceUrl: msg.permalink || `https://t.me/c/${String(msg.chatId).replace(/^-100/, '')}/${msg.id}`,
          locationType: 'comment',
          excerpt: fullText.slice(0, 300).trim(),
          rawPhone: phones[0]?.raw || validPhone,
          platform: 'telegram',
          fingerprint,
          username: msg.senderUsername || undefined,
          name: msg.senderDisplayName || undefined,
          city: leadClassification.city || undefined,
          explicitSellerType: 'agency',
        });
      }
    }
  }

  return {
    scannedCount: messages.length,
    realtorEvidence,
    leadCandidates,
    skippedPrivateDmCount: skippedPrivateDm,
    skippedUnrelatedCount: skippedUnrelated,
    aggregatedGroupMessages: aggregated.length,
  };
}
