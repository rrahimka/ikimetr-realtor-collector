import { describe, it, expect, vi } from 'vitest';
import { Api } from 'telegram';
import {
  resolveAndEnsureTelegramSource,
  scoreTelegramChannelRelevance,
  isTelegramFloodWaitError,
  TELEGRAM_AUTO_JOIN_RELEVANCE,
} from './telegram-discovery';

type GramLong = ConstructorParameters<typeof Api.PeerChannel>[0]['channelId'];
const asGramLong = (value: number): GramLong => BigInt(value) as unknown as GramLong;

const channel = (id: number, opts: { megagroup?: boolean; left?: boolean; username?: string; title?: string } = {}) =>
  new Api.Channel({
    id: asGramLong(id),
    title: opts.title ?? 'Baku Realty',
    ...(opts.megagroup ? { megagroup: true } : { broadcast: true }),
    ...(opts.left ? { left: true } : {}),
    ...(opts.username ? { username: opts.username } : {}),
    accessHash: asGramLong(1),
    photo: undefined as never,
    date: 0,
  });

const dmUser = () =>
  new Api.User({ id: asGramLong(555), accessHash: asGramLong(1), firstName: 'Private', phone: '+9940000000' });

class FloodWaitError extends Error {
  seconds = 30;
  constructor() {
    super('A wait of 30 seconds is required (FloodWaitError)');
    this.name = 'FloodWaitError';
  }
}
class ChannelPrivateError extends Error {}

/**
 * Fake client exposing `getEntity` and `invoke`. When `left` is set, the first
 * getEntity returns the left entity and `invoke` flips to the joined entity for
 * all subsequent lookups (mirroring a real auto-join).
 */
function discoveryClient(entity: unknown, opts: { failJoinWith?: Error } = {}) {
  let joined = false;
  const invoke = vi.fn(async (_req: unknown) => {
    if (opts.failJoinWith) throw opts.failJoinWith;
    joined = true;
    return { id: asGramLong(1) };
  });
  const client = {
    getEntity: (peer: unknown) => {
      if (entity instanceof Error) return Promise.reject(entity);
      // After a successful join, a left entity becomes joined.
      if (joined && entity instanceof Api.Channel && (entity as { left?: boolean }).left) {
        const megagroup = (entity as { megagroup?: boolean }).megagroup;
        const username = (entity as { username?: string }).username;
        const title = (entity as { title?: string }).title;
        const joinedEntity = channel(Number(entity.id.toString()), {
          ...(megagroup === true ? { megagroup: true } : {}),
          ...(typeof username === 'string' ? { username } : {}),
          ...(typeof title === 'string' ? { title } : {}),
        });
        return Promise.resolve(joinedEntity);
      }
      return Promise.resolve(entity);
    },
    invoke,
  };
  return { client: client as never, invoke };
}

describe('resolveAndEnsureTelegramSource — auto-join PUBLIC sources', () => {
  it('resolves an already-joined public channel without joining', async () => {
    const { client, invoke } = discoveryClient(channel(1234567890, { username: 'baku_realty' }));
    const result = await resolveAndEnsureTelegramSource(client, '@baku_realty', { autoJoinPublic: true });
    expect(result.verdict).toBe('resolved');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('auto-joins a PUBLIC channel the account has not joined', async () => {
    const { client, invoke } = discoveryClient(channel(1234567890, { left: true, username: 'baku_realty' }));
    const result = await resolveAndEnsureTelegramSource(client, '@baku_realty', { autoJoinPublic: true });
    expect(result.verdict).toBe('joined');
    expect(result.verdict === 'joined' && result.source.id).toBe(-1001234567890);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-join a left PUBLIC channel when autoJoinPublic is false', async () => {
    const { client, invoke } = discoveryClient(channel(1234567890, { left: true, username: 'baku_realty' }));
    const result = await resolveAndEnsureTelegramSource(client, '@baku_realty', { autoJoinPublic: false });
    expect(result.verdict).toBe('needs_approval');
    expect(result.verdict === 'needs_approval' && result.reason).toBe('left_public');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('marks a left legacy basic group as needs_approval (cannot self-join)', async () => {
    const { client } = discoveryClient(new Api.Chat({ id: asGramLong(777), title: 'Old', participantsCount: 5, left: true, date: 0, version: 1, photo: undefined as never }));
    const result = await resolveAndEnsureTelegramSource(client, '@old_group', { autoJoinPublic: true });
    expect(result.verdict).toBe('needs_approval');
    expect(result.verdict === 'needs_approval' && result.reason).toBe('left_group');
  });
});

describe('resolveAndEnsureTelegramSource — PRIVATE / INVITE-ONLY safety', () => {
  it('routes an invite-only link to needs_approval without any network call', async () => {
    const getEntity = vi.fn();
    const invoke = vi.fn();
    const client = { getEntity, invoke } as never;
    const result = await resolveAndEnsureTelegramSource(client, 'https://t.me/+abcDEF123', { autoJoinPublic: true });
    expect(result.verdict).toBe('needs_approval');
    expect(result.verdict === 'needs_approval' && result.reason).toBe('invite_only');
    expect(getEntity).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('never resolves a private DM (protects against reading private messages)', async () => {
    const { client } = discoveryClient(dmUser());
    const result = await resolveAndEnsureTelegramSource(client, '@someone', { autoJoinPublic: true });
    expect(result.verdict).toBe('rejected');
    expect(result.verdict === 'rejected' && result.error).toBe('private_user');
  });

  it('blocks a join refused by Telegram (channel_private) instead of failing silently', async () => {
    const { client } = discoveryClient(channel(1234567890, { left: true, username: 'baku_realty' }), {
      failJoinWith: new ChannelPrivateError(),
    });
    const result = await resolveAndEnsureTelegramSource(client, '@baku_realty', { autoJoinPublic: true });
    expect(result.verdict).toBe('blocked');
    expect(result.verdict === 'blocked' && result.error).toBe('channel_private');
  });
});

describe('resolveAndEnsureTelegramSource — FloodWait propagation', () => {
  it('propagates FloodWait from the join without retrying inline', async () => {
    const { client } = discoveryClient(channel(1234567890, { left: true, username: 'baku_realty' }), {
      failJoinWith: new FloodWaitError(),
    });
    await expect(resolveAndEnsureTelegramSource(client, '@baku_realty', { autoJoinPublic: true })).rejects.toThrow(
      /FloodWait/i,
    );
  });
});

describe('isTelegramFloodWaitError', () => {
  it('detects a FloodWait error and reads its seconds', () => {
    expect(isTelegramFloodWaitError(new FloodWaitError())).toEqual({ seconds: 30 });
  });
  it('returns undefined for ordinary errors', () => {
    expect(isTelegramFloodWaitError(new Error('boom'))).toBeUndefined();
  });
});

describe('scoreTelegramChannelRelevance', () => {
  it('scores a clearly real-estate Azerbaijani channel high', () => {
    const { score, reasons } = scoreTelegramChannelRelevance(
      'Bakı Əmlak Agentliyi',
      'daşınmaz əmlak, kirayə və satış, mənzil Bakıda',
      5000,
    );
    expect(score).toBeGreaterThan(TELEGRAM_AUTO_JOIN_RELEVANCE);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('scores an unrelated channel low', () => {
    const { score } = scoreTelegramChannelRelevance('Funny Cats Daily', 'мемы и котики каждый день');
    expect(score).toBeLessThan(0.2);
  });

  it('scores an English real-estate channel as relevant', () => {
    const { score } = scoreTelegramChannelRelevance('Baku Property Agent', 'real estate agency, apartments for sale');
    expect(score).toBeGreaterThan(0.4);
  });
});
