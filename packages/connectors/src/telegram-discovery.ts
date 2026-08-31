import { Api } from 'telegram';
import type { TelegramClient } from 'telegram';
import {
  parseTelegramLocator,
  resolveTelegramSourceEntity,
  type ResolvedTelegramSource,
} from './telegram-session-restore';
import { classifyTelegramEntity } from './telegram-entity-guard';
import { CANONICAL_REALESTATE_KEYWORDS } from '@ikimetr/core';

export type TelegramDiscoveryVerdict =
  | { verdict: 'resolved'; source: ResolvedTelegramSource }
  | { verdict: 'joined'; source: ResolvedTelegramSource }
  | { verdict: 'needs_approval'; reason: 'invite_only' | 'left_public' | 'left_group' }
  | { verdict: 'rejected'; error: string }
  | { verdict: 'blocked'; error: string };

export interface ResolveTelegramDiscoveryOptions {
  /** When true, PUBLIC channels/groups the account has not joined are auto-joined. */
  autoJoinPublic?: boolean;
}

function isInviteLink(locator: string): boolean {
  return /^https?:\/\/(www\.)?t\.me\/\+[a-zA-Z0-9_-]+/i.test(locator.trim());
}

/** True for Telegram FloodWait errors; the caller must honour the wait, never retry inline. */
export function isTelegramFloodWaitError(error: unknown): { seconds: number } | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.constructor?.name !== 'FloodWaitError' && error.name !== 'FloodWaitError') return undefined;
  const seconds = Number((error as { seconds?: unknown }).seconds);
  return Number.isFinite(seconds) && seconds > 0 ? { seconds } : undefined;
}

/** Maps a join failure to a short, safe, enumerated reason (never interpolates raw error text). */
function safeJoinError(error: unknown): string {
  const name = error instanceof Error ? error.constructor?.name ?? error.name : '';
  switch (name) {
    case 'ChannelPrivateError':
      return 'channel_private';
    case 'UserBannedInChannelError':
    case 'YouBlockedUserError':
      return 'banned';
    case 'InviteHashExpiredError':
    case 'InviteHashInvalidError':
      return 'invite_invalid';
    case 'ChatAdminRequiredError':
      return 'admin_required';
    default:
      return 'join_failed';
  }
}

/**
 * Resolves the configured Telegram source locator and — when policy allows —
 * auto-joins a PUBLIC channel/group the account has not yet joined.
 *
 * Invite-only / private links are never joined: they return `needs_approval`
 * so the worker can surface an honest, distinct error instead of
 * `telegram_dialog_not_found`. FloodWait from the join propagates to the caller.
 */
export async function resolveAndEnsureTelegramSource(
  client: TelegramClient,
  locator: string,
  options: ResolveTelegramDiscoveryOptions = {},
): Promise<TelegramDiscoveryVerdict> {
  const parsed = parseTelegramLocator(locator);
  if (!parsed) return { verdict: 'rejected', error: 'invalid_locator' };

  // Private / invite-only links cannot be resolved without joining; never do so.
  if (isInviteLink(locator) || (parsed.type === 'username' && parsed.value.startsWith('+'))) {
    return { verdict: 'needs_approval', reason: 'invite_only' };
  }

  let entity: unknown;
  try {
    entity = await client.getEntity(parsed.value);
  } catch (error) {
    if (isTelegramFloodWaitError(error)) throw error;
    return { verdict: 'rejected', error: 'resolve_failed' };
  }

  // A PUBLIC channel / supergroup the account has NOT joined is auto-joinable.
  // This is the precise case that previously surfaced as `telegram_dialog_not_found`:
  // `classifyTelegramEntity` rejects any `left` peer via `left_or_kicked`, so the
  // join must happen BEFORE classification, not after it.
  if (entity instanceof Api.Channel && (entity as { left?: boolean }).left) {
    if (!options.autoJoinPublic) {
      return { verdict: 'needs_approval', reason: 'left_public' };
    }
    try {
      if (entity.accessHash === undefined) {
        return { verdict: 'blocked', error: 'missing_access_hash' };
      }
      await client.invoke(
        new Api.channels.JoinChannel({
          // Build a proper input peer from the resolved entity (type-safe; no cast).
          channel: new Api.InputChannel({ channelId: entity.id, accessHash: entity.accessHash }),
        }),
      );
    } catch (error) {
      if (isTelegramFloodWaitError(error)) throw error;
      return { verdict: 'blocked', error: safeJoinError(error) };
    }
    const joined = await resolveTelegramSourceEntity(client, locator);
    if (!joined) return { verdict: 'blocked', error: 'join_failed' };
    return { verdict: 'joined', source: joined };
  }

  // A legacy basic group the account has not joined cannot be self-joined
  // (GramJS offers no public join for `Api.Chat`); surface an honest approval state.
  if (entity instanceof Api.Chat && (entity as { left?: boolean }).left) {
    return { verdict: 'needs_approval', reason: 'left_group' };
  }

  const verdict = classifyTelegramEntity(entity);
  if (!verdict.allowed || !verdict.kind) {
    return { verdict: 'rejected', error: verdict.reason ?? 'unsupported_entity' };
  }

  const resolved = await resolveTelegramSourceEntity(client, locator);
  return resolved ? { verdict: 'resolved', source: resolved } : { verdict: 'rejected', error: 'resolve_failed' };
}

export interface TelegramRelevanceScore {
  score: number;
  reasons: string[];
}

/**
 * Scores how relevant a Telegram channel/group is to Azerbaijan real estate,
 * using the canonical multilingual keyword registry. Title matches weigh more
 * than the about/bio text. Returns a 0..1 score with human-readable reasons.
 */
export function scoreTelegramChannelRelevance(
  title: string | undefined,
  about: string | undefined,
  memberCount?: number | undefined,
): TelegramRelevanceScore {
  const titleText = (title ?? '').toLowerCase();
  const aboutText = (about ?? '').toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  const matchLang = (lang: 'az' | 'ru' | 'en', weight: number, label: string) => {
    const terms = CANONICAL_REALESTATE_KEYWORDS[lang];
    let matched = 0;
    for (const term of terms) {
      const t = term.toLowerCase();
      if (titleText.includes(t)) matched += 1;
      else if (aboutText.includes(t)) matched += 0.4;
    }
    if (matched > 0) {
      // Each title hit is worth `weight/2`; about hits are discounted. The
      // per-language contribution is capped at `weight` so one language cannot
      // saturate the whole score on its own.
      const points = Math.min(weight, matched * (weight / 2));
      score += points;
      reasons.push(`${label}:+${points.toFixed(2)}`);
    }
  };

  matchLang('az', 0.6, 'az_realtor_terms');
  matchLang('ru', 0.6, 'ru_realtor_terms');
  matchLang('en', 0.5, 'en_realtor_terms');

  // Geo signals (Baku + districts) strengthen relevance.
  const geoHits = ['bakı', 'baki', 'baku', 'yasamal', 'nəsimi', 'nasimi', 'xətai', 'khatai', 'nərimanov', 'nerimanov']
    .filter((g) => titleText.includes(g) || aboutText.includes(g)).length;
  if (geoHits > 0) {
    score += Math.min(0.15, geoHits * 0.05);
    reasons.push(`geo:+${Math.min(0.15, geoHits * 0.05).toFixed(2)}`);
  }

  // Popularity is a weak positive signal, not a necessity.
  if (typeof memberCount === 'number' && memberCount > 1000) {
    score += 0.05;
    reasons.push('popular:+0.05');
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  return { score, reasons };
}

/** Threshold above which a discovered PUBLIC Telegram source is eligible for auto-join. */
export const TELEGRAM_AUTO_JOIN_RELEVANCE = 0.5;
