import { Api } from 'telegram';

export type CollectibleTelegramEntityKind = 'channel' | 'supergroup' | 'group';

export type TelegramEntityRejection =
  | 'private_user'
  | 'secret_chat'
  | 'left_or_kicked'
  | 'unsupported_entity';

export interface TelegramEntityVerdict {
  allowed: boolean;
  kind?: CollectibleTelegramEntityKind | undefined;
  reason?: TelegramEntityRejection | undefined;
}

/**
 * Authoritative Telegram entity type check.
 *
 * This is the single place that decides whether a Telegram peer may enter the
 * collector. Every layer (dialog filtering, configured-source resolution,
 * message conversion and the authorized-message scan) must go through this
 * helper so a private DM cannot slip in through a bypass at one layer.
 *
 * Allowed: broadcast channels, supergroups/megagroups and basic groups.
 * Rejected: users/private DMs, secret chats, and anything unknown.
 */
export function classifyTelegramEntity(entity: unknown): TelegramEntityVerdict {
  if (entity instanceof Api.User || entity instanceof Api.UserEmpty) {
    return { allowed: false, reason: 'private_user' };
  }

  // EncryptedChat / EncryptedChatEmpty / EncryptedChatWaiting / Discarded
  if (
    entity instanceof Api.EncryptedChat ||
    entity instanceof Api.EncryptedChatEmpty ||
    entity instanceof Api.EncryptedChatWaiting ||
    entity instanceof Api.EncryptedChatDiscarded ||
    entity instanceof Api.EncryptedChatRequested
  ) {
    return { allowed: false, reason: 'secret_chat' };
  }

  if (entity instanceof Api.Channel) {
    if (entity.left) return { allowed: false, reason: 'left_or_kicked' };
    return { allowed: true, kind: entity.megagroup ? 'supergroup' : 'channel' };
  }

  if (entity instanceof Api.Chat) {
    if (entity.left || entity.deactivated) return { allowed: false, reason: 'left_or_kicked' };
    return { allowed: true, kind: 'group' };
  }

  // ChatForbidden, ChatEmpty, ChannelForbidden, PeerUser, and anything else.
  return { allowed: false, reason: 'unsupported_entity' };
}

/**
 * Numeric peer-ID guard. Telegram user/DM peers carry a positive ID, while
 * groups and channels are always negative (-<id> for basic groups,
 * -100<id> for channels/supergroups).
 *
 * Used as a cheap secondary check; it never replaces classifyTelegramEntity.
 */
export function isCollectibleTelegramChatId(chatId: number | bigint | string): boolean {
  const numeric = typeof chatId === 'bigint' ? chatId : Number(String(chatId));
  if (!Number.isFinite(numeric)) return false;
  return numeric < 0;
}
