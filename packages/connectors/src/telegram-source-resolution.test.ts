import { describe, it, expect } from 'vitest';
import { Api } from 'telegram';
import { resolveTelegramSourceEntity } from './telegram-session-restore';

/**
 * GramJS types its `long` fields as big-integer's BigInteger; tests build native
 * bigints and adapt them through this single helper.
 */
type GramLong = ConstructorParameters<typeof Api.PeerChannel>[0]['channelId'];
const asGramLong = (value: number): GramLong => BigInt(value) as unknown as GramLong;

/**
 * Fake client that exposes ONLY getEntity.
 *
 * `getDialogs` deliberately throws: the configured-source resolver must perform
 * one targeted entity lookup and must never enumerate or scan the account.
 */
function entityClient(entity: unknown) {
  const calls: unknown[] = [];
  const client = {
    getEntity: (peer: unknown) => {
      calls.push(peer);
      if (entity instanceof Error) return Promise.reject(entity);
      return Promise.resolve(entity);
    },
    getDialogs: () => {
      throw new Error('getDialogs must never be called during configured-source resolution');
    },
  };
  return { client: client as never, calls };
}

// Optional flags are spread conditionally: the repo enables
// `exactOptionalPropertyTypes`, so passing `left: undefined` is a type error.
const channel = (id: number, opts: { megagroup?: boolean; left?: boolean } = {}) =>
  new Api.Channel({
    id: asGramLong(id),
    title: 'Baku Realty',
    ...(opts.megagroup ? { megagroup: true } : { broadcast: true }),
    ...(opts.left ? { left: true } : {}),
    accessHash: asGramLong(1),
    photo: undefined as never,
    date: 0,
  });

const basicGroup = (id: number, opts: { left?: boolean } = {}) =>
  new Api.Chat({
    id: asGramLong(id),
    title: 'Old Group',
    participantsCount: 5,
    ...(opts.left ? { left: true } : {}),
    date: 0,
    version: 1,
    photo: undefined as never,
  });

describe('resolveTelegramSourceEntity — configured source allowlist', () => {
  it('resolves a configured broadcast channel to its -100 peer id', async () => {
    const { client, calls } = entityClient(channel(1234567890));
    const result = await resolveTelegramSourceEntity(client, '@baku_realty');

    expect(result).toMatchObject({ id: -1001234567890, kind: 'channel', title: 'Baku Realty' });
    expect(result?.username).toBe('baku_realty');
    // Exactly one targeted lookup, never a dialog scan.
    expect(calls).toEqual(['baku_realty']);
  });

  it('resolves a configured supergroup to its -100 peer id', async () => {
    const { client } = entityClient(channel(1234567890, { megagroup: true }));
    const result = await resolveTelegramSourceEntity(client, '@baku_realty');

    expect(result).toMatchObject({ id: -1001234567890, kind: 'supergroup' });
  });

  it('resolves a configured basic group to its negative peer id', async () => {
    const { client } = entityClient(basicGroup(777));
    const result = await resolveTelegramSourceEntity(client, '@old_group');

    expect(result).toMatchObject({ id: -777, kind: 'group' });
  });

  it('resolves a private channel permalink with a single numeric lookup', async () => {
    const { client, calls } = entityClient(channel(1234567890));
    const result = await resolveTelegramSourceEntity(client, 'https://t.me/c/1234567890/55');

    expect(result?.id).toBe(-1001234567890);
    expect(calls).toEqual([-1001234567890]);
  });

  it('resolves an entity by bare numeric peer id', async () => {
    const { client, calls } = entityClient(channel(1234567890));
    const result = await resolveTelegramSourceEntity(client, '-1001234567890');

    expect(result?.id).toBe(-1001234567890);
    expect(calls).toEqual([-1001234567890]);
  });
});

describe('resolveTelegramSourceEntity — private DMs and rejected entities', () => {
  it('refuses to resolve a private user (DM)', async () => {
    const user = new Api.User({
      id: asGramLong(555),
      accessHash: asGramLong(1),
      firstName: 'Private',
      phone: '+9940000000',
    });
    const { client } = entityClient(user);
    expect(await resolveTelegramSourceEntity(client, '@someone')).toBeUndefined();
  });

  it('refuses to resolve a secret chat', async () => {
    const { client } = entityClient(new Api.EncryptedChatEmpty({ id: 1 }));
    expect(await resolveTelegramSourceEntity(client, '@secret')).toBeUndefined();
  });

  it('refuses to resolve a group the account has left', async () => {
    const { client } = entityClient(channel(1234567890, { left: true }));
    expect(await resolveTelegramSourceEntity(client, '@left_channel')).toBeUndefined();
  });

  it('refuses to resolve a forbidden chat', async () => {
    const { client } = entityClient(new Api.ChatForbidden({ id: asGramLong(9), title: 'Blocked' }));
    expect(await resolveTelegramSourceEntity(client, '@blocked')).toBeUndefined();
  });

  it('refuses to resolve unknown or empty entities', async () => {
    expect(await resolveTelegramSourceEntity(entityClient(undefined).client, '@x')).toBeUndefined();
    expect(await resolveTelegramSourceEntity(entityClient({ title: 'fake' }).client, '@x')).toBeUndefined();
  });

  it('rejects a malformed private-DM bypass attempt before any network call', async () => {
    // A positive bare id can never address a collectible chat.
    const { client, calls } = entityClient(channel(1234567890));
    expect(await resolveTelegramSourceEntity(client, 'https://t.me/c')).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('rejects an unparseable locator without contacting Telegram at all', async () => {
    const { client, calls } = entityClient(channel(1));
    expect(await resolveTelegramSourceEntity(client, 'https://example.com/listings')).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
