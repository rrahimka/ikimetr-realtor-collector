import { describe, expect, it } from 'vitest';
import { StringSession } from 'telegram/sessions';
import {
  buildGramjsString,
  fromTeleprotoStringSession,
  getSessionIdentity,
  toTeleprotoStringSession,
  type TeleprotoSessionIdentity,
} from './session-compat';

function makeIdentity(overrides: Partial<TeleprotoSessionIdentity> = {}): TeleprotoSessionIdentity {
  return {
    dcId: 2,
    serverAddress: '149.154.167.40',
    port: 443,
    authKey: Buffer.alloc(256, 0x07),
    ...overrides,
  };
}

describe('session-compat (teleproto ↔ GramJS shim)', () => {
  it('round-trips a real GramJS session string losslessly (auth key preserved)', async () => {
    const original = buildGramjsString(makeIdentity());
    expect(original.startsWith('1')).toBe(true);

    const identity = await getSessionIdentity(original);
    expect(identity.dcId).toBe(2);
    expect(identity.serverAddress).toBe('149.154.167.40');
    expect(identity.port).toBe(443);
    expect(identity.authKey.length).toBe(256);
    expect(identity.authKey.equals(Buffer.alloc(256, 0x07))).toBe(true);

    const teleprotoString = await toTeleprotoStringSession(original);
    expect(teleprotoString).toBe(original); // deterministic re-emit

    const rebuilt = fromTeleprotoStringSession(teleprotoString);
    const reIdentity = await getSessionIdentity(rebuilt);
    expect(reIdentity.dcId).toBe(identity.dcId);
    expect(reIdentity.serverAddress).toBe(identity.serverAddress);
    expect(reIdentity.port).toBe(identity.port);
    expect(reIdentity.authKey.equals(identity.authKey)).toBe(true);
  });

  it('preserves a high-entropy random auth key across the round trip', async () => {
    const key = Buffer.from(
      Array.from({ length: 256 }, (_, i) => (i * 31 + 17) & 0xff),
    );
    const original = buildGramjsString(makeIdentity({ dcId: 4, authKey: key }));

    const teleprotoString = await toTeleprotoStringSession(original);
    const rebuilt = fromTeleprotoStringSession(teleprotoString);
    const reIdentity = await getSessionIdentity(rebuilt);

    expect(reIdentity.dcId).toBe(4);
    expect(reIdentity.authKey.equals(key)).toBe(true);
    expect(teleprotoString).toBe(original);
  });

  it('accepts a live StringSession instance, not just a string', async () => {
    const original = buildGramjsString(makeIdentity({ dcId: 5 }));
    const session = new StringSession(original);
    const teleprotoString = await toTeleprotoStringSession(session);
    expect(teleprotoString).toBe(original);

    const identity = await getSessionIdentity(session);
    expect(identity.dcId).toBe(5);
  });

  it('throws on an empty / key-less session instead of fabricating one', async () => {
    await expect(getSessionIdentity(new StringSession(''))).rejects.toThrow(/no auth key/i);
    await expect(toTeleprotoStringSession('')).rejects.toThrow(/no auth key/i);
  });

  it('rejects malformed session strings', () => {
    expect(() => fromTeleprotoStringSession('not-a-valid-session')).toThrow();
  });
});
