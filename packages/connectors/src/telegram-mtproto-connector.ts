import { Api, TelegramClient } from 'telegram';
import {
  isPermittedTelegramAuthorizedMessage,
  scanTelegramAuthorizedMessages,
  type TelegramAuthorizedMessage,
} from './telegram-authorized';
import { classifyTelegramEntity, isCollectibleTelegramChatId } from './telegram-entity-guard';
import type { ConnectorResult } from './types';

export interface TelegramMTProtoSourceConfig {
  chatId: number;
  limit?: number;
  /** Highest message id already processed. Messages with id <= this are skipped. */
  minId?: number;
  sourceId?: number;
  knownRealtorPhones?: Set<string>;
}

export interface TelegramMTProtoFetchResult {
  messages: TelegramAuthorizedMessage[];
  scanResult: ReturnType<typeof scanTelegramAuthorizedMessages>;
  /** Highest message id seen in this batch, for checkpointing. */
  highestMessageId: number;
}

/** Telegram peer types that represent a collectible group or channel. */
function isCollectiblePeer(peer: unknown): boolean {
  return peer instanceof Api.PeerChannel || peer instanceof Api.PeerChat;
}

/**
 * Fetches messages from ONE authorized Telegram group/channel and runs them
 * through the existing lead/evidence extraction pipeline.
 *
 * This is the bridge between the authenticated MTProto session and the
 * collector data pipeline.
 *
 * - Never prints session strings, apiHash, OTP, or 2FA passwords.
 * - Rejects private DMs and secret chats at the peer level for every message.
 * - Uses `minId` so each run fetches only messages NEWER than the checkpoint.
 */
export async function fetchTelegramAuthorizedMessages(
  client: TelegramClient,
  config: TelegramMTProtoSourceConfig,
): Promise<TelegramMTProtoFetchResult> {
  const { chatId, limit = 50, minId, sourceId, knownRealtorPhones } = config;

  if (!isCollectibleTelegramChatId(chatId)) {
    throw new Error('telegram_private_chat_rejected');
  }

  const rawMessages = await client.getMessages(chatId, {
    limit,
    // minId excludes every message with an id <= the checkpoint, which is the
    // correct direction for incremental collection. (offsetId would return
    // OLDER messages and walk backwards through history.)
    ...(minId != null && minId > 0 ? { minId } : {}),
  });

  const messages: TelegramAuthorizedMessage[] = [];
  let highestMessageId = 0;
  let skippedPrivateDm = 0;

  for (const msg of rawMessages) {
    if (!(msg instanceof Api.Message)) continue;

    // Authoritative per-message rejection: a private DM or secret chat can
    // never enter the pipeline even if an upstream check is bypassed.
    //
    // msg.peerId and msg.chatId are always populated (both derive from the
    // required Message.peerId), so they are the reliable guards. msg.chat is
    // only present when Telegram returned the chat entity, so it is verified
    // opportunistically and never used as the sole gate.
    if (!isCollectiblePeer(msg.peerId)) {
      skippedPrivateDm += 1;
      continue;
    }

    const rawChatId = msg.chatId != null ? Number(msg.chatId.toString()) : Number.NaN;
    if (!isCollectibleTelegramChatId(rawChatId)) {
      skippedPrivateDm += 1;
      continue;
    }

    if (msg.chat && !classifyTelegramEntity(msg.chat).allowed) {
      skippedPrivateDm += 1;
      continue;
    }

    if (msg.id > highestMessageId) highestMessageId = msg.id;

    const isChannel = msg.isChannel;
    const isGroup = msg.isGroup;
    const chatType = isChannel ? 'channel' : isGroup ? 'supergroup' : 'group';

    // GramJS only fills the `text` getter when the message came back through a
    // real client. Fall back to the raw MTProto `message` field so extraction
    // can never silently see an empty string.
    const text = msg.text || msg.message || '';

    const entry: TelegramAuthorizedMessage = {
      id: msg.id,
      chatId: rawChatId,
      chatType,
      text,
      date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
    };

    if (msg.senderId) entry.senderId = Number(msg.senderId.toString());

    if (isChannel) {
      entry.permalink = `https://t.me/c/${String(rawChatId).replace(/^-100/, '')}/${msg.id}`;
    }

    // Final belt-and-braces check through the existing permitted-message guard.
    if (!isPermittedTelegramAuthorizedMessage(entry)) {
      skippedPrivateDm += 1;
      continue;
    }

    messages.push(entry);
  }

  const scanResult = scanTelegramAuthorizedMessages(messages, {
    ...(sourceId != null ? { sourceId } : {}),
    ...(knownRealtorPhones != null ? { knownRealtorPhones } : {}),
  });
  scanResult.skippedPrivateDmCount += skippedPrivateDm;

  return { messages, scanResult, highestMessageId };
}

/**
 * Converts scan results into ConnectorResult format for the worker pipeline.
 * Client leads (buyer / seller / realtor_request) are carried on the result so
 * the worker can persist them; they are not dropped.
 */
export function scanResultToConnectorResult(
  scanResult: ReturnType<typeof scanTelegramAuthorizedMessages>,
): ConnectorResult {
  const items = scanResult.realtorEvidence.map((ev) => ({
    sourceUrl: ev.sourceUrl,
    locationType: ev.locationType,
    excerpt: ev.excerpt,
    rawPhone: ev.rawPhone,
    name: ev.name,
    agency: ev.agency,
    city: ev.city,
    username: ev.username,
    platform: ev.platform,
    fingerprint: ev.fingerprint,
    explicitSellerType: ev.explicitSellerType,
  }));

  return {
    items,
    pagesChecked: 1,
    estimatedItems: items.length,
    leads: scanResult.leadCandidates,
  };
}
