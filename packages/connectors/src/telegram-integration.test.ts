import { describe, it, expect } from 'vitest';
import { Api } from 'telegram';
import { fetchTelegramAuthorizedMessages } from './telegram-mtproto-connector';
import { parseTelegramLocator } from './telegram-session-restore';
import { classifyTelegramEntity, isCollectibleTelegramChatId } from './telegram-entity-guard';

/**
 * GramJS types its `long` fields as big-integer's BigInteger, and big-integer is
 * not a direct dependency of this package. Tests build native bigints and adapt
 * them through this single helper.
 */
type GramLong = ConstructorParameters<typeof Api.PeerChannel>[0]['channelId'];
const asGramLong = (value: number): GramLong => BigInt(value) as unknown as GramLong;

/** Minimal fake client that records the params passed to getMessages. */
function recordingClient(returned: unknown[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    getMessages: (_peer: unknown, params: Record<string, unknown>) => {
      calls.push(params);
      return Promise.resolve(returned);
    },
  };
  return { client: client as never, calls };
}

describe('Telegram incremental fetch direction', () => {
  it('passes minId so only messages NEWER than the checkpoint are fetched', async () => {
    const { client, calls } = recordingClient();
    await fetchTelegramAuthorizedMessages(client, {
      chatId: -1001234567890,
      limit: 10,
      minId: 500,
    });

    expect(calls).toHaveLength(1);
    // offsetId would return messages OLDER than the checkpoint, which walks
    // backwards through history and never sees new messages. It must not be used.
    expect(calls[0]).not.toHaveProperty('offsetId');
    expect(calls[0]!['minId']).toBe(500);
    expect(calls[0]!['limit']).toBe(10);
  });

  it('omits minId entirely on a first run (no checkpoint)', async () => {
    const { client, calls } = recordingClient();
    await fetchTelegramAuthorizedMessages(client, { chatId: -1001234567890, limit: 25 });

    expect(calls[0]).toEqual({ limit: 25 });
  });

  it('reports the highest message id for checkpointing', async () => {
    const { client } = recordingClient();
    const result = await fetchTelegramAuthorizedMessages(client, { chatId: -1001234567890 });
    expect(result.highestMessageId).toBe(0); // no messages returned
  });
});

describe('message conversion', () => {
  it('converts a channel message and builds its permalink', async () => {
    const msg = new Api.Message({
      id: 900,
      peerId: new Api.PeerChannel({ channelId: asGramLong(1234567890) }),
      date: 1_700_000_000,
      message: 'Makler 050 123 45 67',
      post: true,
    });

    const { client } = recordingClient([msg]);
    const result = await fetchTelegramAuthorizedMessages(client, { chatId: -1001234567890 });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.id).toBe(900);
    expect(result.messages[0]!.chatType).toBe('channel');
    expect(result.messages[0]!.permalink).toBe('https://t.me/c/1234567890/900');
    expect(result.highestMessageId).toBe(900);
  });

  it('converts a basic group message', async () => {
    const msg = new Api.Message({
      id: 42,
      peerId: new Api.PeerChat({ chatId: asGramLong(777) }),
      date: 1_700_000_000,
      message: 'Ev satiram 050 123 45 67',
    });

    const { client } = recordingClient([msg]);
    const result = await fetchTelegramAuthorizedMessages(client, { chatId: -777 });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.chatId).toBe(-777);
  });

  it('drops a private DM message even if one reaches the converter', async () => {
    const dm = new Api.Message({
      id: 901,
      peerId: new Api.PeerUser({ userId: asGramLong(555) }),
      date: 1_700_000_000,
      message: 'private hello',
    });

    const { client } = recordingClient([dm]);
    const result = await fetchTelegramAuthorizedMessages(client, { chatId: -1001234567890 });

    expect(result.messages).toHaveLength(0);
    expect(result.scanResult.skippedPrivateDmCount).toBeGreaterThan(0);
  });

  it('processes converted messages into realtor evidence', async () => {
    const msg = new Api.Message({
      id: 910,
      peerId: new Api.PeerChannel({ channelId: asGramLong(1234567890) }),
      date: 1_700_000_000,
      message: 'Makler xidmeti, elaqe: 050 123 45 67',
      post: true,
    });

    const { client } = recordingClient([msg]);
    const result = await fetchTelegramAuthorizedMessages(client, { chatId: -1001234567890, sourceId: 7 });

    expect(result.scanResult.realtorEvidence.length).toBeGreaterThan(0);
    expect(result.scanResult.realtorEvidence[0]!.platform).toBe('telegram');
    expect(result.scanResult.realtorEvidence[0]!.explicitSellerType).toBe('agency');
  });
});

describe('parseTelegramLocator', () => {
  it('parses @handle and t.me/handle forms', () => {
    expect(parseTelegramLocator('@baku_realty')).toEqual({ type: 'username', value: 'baku_realty' });
    expect(parseTelegramLocator('https://t.me/baku_realty')).toEqual({ type: 'username', value: 'baku_realty' });
    expect(parseTelegramLocator('http://www.t.me/baku_realty')).toEqual({ type: 'username', value: 'baku_realty' });
  });

  it('parses private channel permalinks into -100 peer ids', () => {
    expect(parseTelegramLocator('https://t.me/c/1234567890/55')).toEqual({ type: 'peerId', value: -1001234567890 });
    expect(parseTelegramLocator('https://t.me/c/1234567890')).toEqual({ type: 'peerId', value: -1001234567890 });
  });

  it('normalizes bare numeric ids to the -100 channel peer form', () => {
    expect(parseTelegramLocator('-1001234567890')).toEqual({ type: 'peerId', value: -1001234567890 });
    expect(parseTelegramLocator('1234567890')).toEqual({ type: 'peerId', value: -1001234567890 });
  });

  it('rejects empty, reserved and non-Telegram input', () => {
    expect(parseTelegramLocator('')).toBeUndefined();
    expect(parseTelegramLocator('   ')).toBeUndefined();
    expect(parseTelegramLocator('https://t.me/c')).toBeUndefined();
    expect(parseTelegramLocator('https://example.com/listings')).toBeUndefined();
  });
});

describe('Telegram entity allowlist', () => {
  it('rejects private users (DMs)', () => {
    const verdict = classifyTelegramEntity(
      new Api.User({ id: asGramLong(555), accessHash: asGramLong(1), firstName: 'Private', phone: '+9940000000' }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('private_user');
  });

  it('rejects secret/private chats', () => {
    const verdict = classifyTelegramEntity(new Api.EncryptedChatEmpty({ id: 1 }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('secret_chat');
  });

  it('allows broadcast channels and distinguishes them from supergroups', () => {
    const channel = classifyTelegramEntity(
      new Api.Channel({ id: asGramLong(42), title: 'Baku Realty', broadcast: true, accessHash: asGramLong(1), photo: undefined as never, date: 0 }),
    );
    expect(channel.allowed).toBe(true);
    expect(channel.kind).toBe('channel');

    const supergroup = classifyTelegramEntity(
      new Api.Channel({ id: asGramLong(43), title: 'Baku Realty Group', megagroup: true, accessHash: asGramLong(1), photo: undefined as never, date: 0 }),
    );
    expect(supergroup.allowed).toBe(true);
    expect(supergroup.kind).toBe('supergroup');
  });

  it('allows basic groups', () => {
    const verdict = classifyTelegramEntity(
      new Api.Chat({ id: asGramLong(77), title: 'Old Group', participantsCount: 5, date: 0, version: 1, photo: undefined as never }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.kind).toBe('group');
  });

  it('rejects forbidden/empty/unknown entities rather than assuming they are safe', () => {
    expect(classifyTelegramEntity(new Api.ChatForbidden({ id: asGramLong(9), title: 'Blocked' })).allowed).toBe(false);
    expect(classifyTelegramEntity(new Api.ChatEmpty({ id: asGramLong(9) })).allowed).toBe(false);
    expect(classifyTelegramEntity(undefined).allowed).toBe(false);
    expect(classifyTelegramEntity({ title: 'fake' }).allowed).toBe(false);
  });

  it('rejects groups the account has left', () => {
    expect(classifyTelegramEntity(new Api.Chat({
      id: asGramLong(78), title: 'Left Group', left: true, participantsCount: 0, date: 0, version: 1, photo: undefined as never,
    })).reason).toBe('left_or_kicked');
  });
});

describe('isCollectibleTelegramChatId', () => {
  it('accepts only negative peer ids', () => {
    expect(isCollectibleTelegramChatId(-1001234567890)).toBe(true);
    expect(isCollectibleTelegramChatId(-12345)).toBe(true);
    expect(isCollectibleTelegramChatId('-1001234567890')).toBe(true);
  });

  it('rejects positive ids and malformed values', () => {
    expect(isCollectibleTelegramChatId(12345)).toBe(false);
    expect(isCollectibleTelegramChatId(0)).toBe(false);
    expect(isCollectibleTelegramChatId(Number.NaN)).toBe(false);
    expect(isCollectibleTelegramChatId('abc')).toBe(false);
    expect(isCollectibleTelegramChatId('')).toBe(false);
  });
});
