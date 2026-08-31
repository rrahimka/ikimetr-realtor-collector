import { existsSync, readFileSync } from 'node:fs';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { isProviderConfigured, getProviderProfile } from '@ikimetr/core';
import { decryptSecret } from './secret-storage';
import { resolveConnectionsStorePath } from './paths';
import { classifyTelegramEntity, isCollectibleTelegramChatId, type CollectibleTelegramEntityKind } from './telegram-entity-guard';

export interface TelegramRestoreConfig {
  apiId: number;
  apiHash: string;
  sessionString: string;
}

export interface TelegramRestoreResult {
  client: TelegramClient;
  authenticated: boolean;
}

export interface ResolvedTelegramSource {
  id: number;
  title: string;
  kind: CollectibleTelegramEntityKind;
  username: string | undefined;
}

export type TelegramLocator =
  | { type: 'username'; value: string }
  | { type: 'peerId'; value: number };

/**
 * Pure parser for a configured source locator. Kept separate from any network
 * call so it can be unit tested without Telegram.
 *
 * Supports:
 *   @handle
 *   https://t.me/handle
 *   https://t.me/c/<numericChannelId>[/<messageId>]
 *   -1001234567890 / 1234567890 (bare numeric peer id)
 */
export function parseTelegramLocator(locator: string): TelegramLocator | undefined {
  const raw = locator.trim();
  if (!raw) return undefined;

  // Bare numeric peer id, optionally with a leading -100.
  if (/^-?\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isSafeInteger(numeric)) return undefined;
    // A bare positive number can only be a legacy basic group id; channels are
    // addressed as -100<id>. Normalize positive ids to the -100 channel form so
    // getEntity resolves the channel/supergroup rather than a user peer.
    const peerId = numeric > 0 ? Number(`-100${numeric}`) : numeric;
    if (!isCollectibleTelegramChatId(peerId)) return undefined;
    return { type: 'peerId', value: peerId };
  }

  // https://t.me/c/<numericChannelId>[/<messageId>] — private channel permalink.
  const privateLink = raw.match(/t\.me\/c\/(-?\d+)(?:\/(\d+))?/i);
  if (privateLink?.[1]) {
    const numeric = Number(privateLink[1]);
    if (!Number.isSafeInteger(numeric)) return undefined;
    const peerId = numeric > 0 ? Number(`-100${numeric}`) : numeric;
    if (!isCollectibleTelegramChatId(peerId)) return undefined;
    return { type: 'peerId', value: peerId };
  }

  // @handle or https://t.me/handle (also tolerates /s/ and joinchat suffixes).
  const handle = raw.match(/^(?:@|https?:\/\/(?:www\.)?t\.me\/(?:s\/|\+)?)?([a-zA-Z0-9_]{4,32})$/i)
    ?? raw.match(/\.me\/(?:s\/|\+)?([a-zA-Z0-9_]{4,32})/i);
  const username = handle?.[1];
  if (!username) return undefined;

  // Reserved Telegram paths are not group handles.
  if (['c', 's', 'joinchat', 'addstickers', 'share'].includes(username.toLowerCase())) return undefined;

  return { type: 'username', value: username };
}

function readTelegramSessionFromStore(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const storePath = resolveConnectionsStorePath(env);
  if (!existsSync(storePath)) return undefined;
  try {
    const raw = readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw) as { accounts?: { telegram?: { sessionString?: string } } };
    const encrypted = parsed.accounts?.telegram?.sessionString;
    if (!encrypted || typeof encrypted !== 'string') return undefined;
    // A wrong/missing key or corrupted ciphertext throws; treat it as "no usable
    // session" rather than leaking the failure or falling back to a fake state.
    return decryptSecret(encrypted);
  } catch {
    return undefined;
  }
}

function getTelegramCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { apiId: number; apiHash: string } | undefined {
  const profile = getProviderProfile('telegram');
  if (!isProviderConfigured(profile, env)) return undefined;
  const apiId = Number(env.TELEGRAM_API_ID);
  const apiHash = env.TELEGRAM_API_HASH ?? '';
  if (!apiId || !apiHash) return undefined;
  return { apiId, apiHash };
}

/**
 * Restores an authenticated Telegram client from the encrypted persisted session.
 * Runs independently of the web process — safe for worker use.
 *
 * Never logs or returns apiHash, sessionString, or TELEGRAM_SESSION_SECRET, and
 * never initiates OTP/2FA: the worker only consumes an already-authenticated
 * session.
 */
export async function restoreTelegramClient(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TelegramRestoreResult | undefined> {
  const creds = getTelegramCredentialsFromEnv(env);
  if (!creds) return undefined;

  const sessionString = readTelegramSessionFromStore(env);
  if (!sessionString) return undefined;

  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, creds.apiId, creds.apiHash, {
    connectionRetries: 2,
    retryDelay: 1_000,
  });

  await client.connect();
  const authenticated = await client.isUserAuthorized();

  return { client, authenticated };
}

/**
 * Resolves ONLY the explicitly configured source locator to a Telegram entity.
 *
 * Uses a single targeted getEntity() call instead of enumerating dialogs, so an
 * unrelated group or channel in the account is never touched. Private DMs and
 * secret chats are rejected by the shared entity guard.
 */
export async function resolveTelegramSourceEntity(
  client: TelegramClient,
  locator: string,
): Promise<ResolvedTelegramSource | undefined> {
  const parsed = parseTelegramLocator(locator);
  if (!parsed) return undefined;

  const entity = await client.getEntity(parsed.value);
  const verdict = classifyTelegramEntity(entity);
  if (!verdict.allowed || !verdict.kind) return undefined;

  // GramJS entity ids are bare (positive); the API peer id is what getMessages
  // needs: -100<id> for channels/supergroups, -<id> for legacy basic groups.
  const bareId = Number((entity as { id?: { toString(): string } | number }).id?.toString() ?? 0);
  if (!Number.isSafeInteger(bareId) || bareId <= 0) return undefined;
  const id = verdict.kind === 'group' ? -bareId : Number(`-100${bareId}`);
  if (!isCollectibleTelegramChatId(id)) return undefined;

  const title = (entity as { title?: string }).title ?? '';
  const username =
    parsed.type === 'username'
      ? parsed.value
      : ((entity as { username?: string }).username ?? undefined);

  return { id, title, kind: verdict.kind, username };
}
