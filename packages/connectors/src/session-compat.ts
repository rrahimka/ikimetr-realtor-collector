/**
 * Teleproto ↔ GramJS session compatibility shim.
 *
 * Context (see docs/superpowers/specs/2026-08-31-autonomous-realtor-discovery-design.md,
 * OSS audit #2): the `teleproto` MTProto client is evaluated as a COMPAT-SHIM
 * only. Its `StringSession` is wire-compatible with GramJS — both clients store
 * the same DC id and the same 256-byte MTProto auth key on the wire. GramJS
 * (`telegram`) remains the live adapter; we must never risk losing the user's
 * authenticated session if a future migration adopts teleproto.
 *
 * This module pins the migration boundary: a `TeleprotoSessionIdentity`
 * (dcId + serverAddress + port + raw auth key) is the minimal, provably
 * lossless unit. `toTeleprotoStringSession()` normalises any GramJS session to
 * its canonical wire representation (GramJS and teleproto read the same bytes);
 * `fromTeleprotoStringSession()` rebuilds a GramJS `StringSession` from that
 * representation so the current code keeps working unchanged.
 *
 * teleproto is intentionally NOT a runtime dependency — this shim only needs
 * the live GramJS adapter to prove round-trip safety.
 */

import { StringSession } from 'telegram/sessions';

export interface TeleprotoSessionIdentity {
  /** Data-center id the session is bound to. */
  dcId: number;
  /** Server address GramJS persisted (re-resolvable from dcId if absent). */
  serverAddress: string;
  /** TLS port GramJS persisted. */
  port: number;
  /** Raw MTProto auth key bytes (the wire identity teleproto also stores). */
  authKey: Buffer;
}

/**
 * Extracts the migration-safe session identity from a GramJS `StringSession`
 * (or a saved GramJS session string). `load()` is required because it
 * reconstructs the `AuthKey` object from the parsed wire buffer; the raw key
 * bytes are then read via `authKey.getKey()`.
 */
export async function getSessionIdentity(
  session: StringSession | string,
): Promise<TeleprotoSessionIdentity> {
  const s = typeof session === 'string' ? new StringSession(session) : session;
  await s.load();
  const key = s.authKey?.getKey();
  if (!key || key.length === 0) {
    throw new Error('Session has no auth key; cannot derive a teleproto-compatible identity');
  }
  return {
    dcId: s.dcId,
    serverAddress: s.serverAddress ?? '',
    port: s.port ?? 0,
    authKey: Buffer.from(key),
  };
}

/**
 * Re-emits the canonical GramJS wire string from a session identity. The format
 * mirrors GramJS `StringSession.save()` exactly: a `"1"` version tag followed
 * by base64(dcId + addrLen + address + port + authKey). Because teleproto shares
 * the same dcId + authKey on the wire, this string is directly consumable by a
 * teleproto client after its own parse — hence "teleproto-compatible".
 */
export function buildGramjsString(identity: TeleprotoSessionIdentity): string {
  const dcBuffer = Buffer.from([identity.dcId & 0xff]);
  const addressBuffer = Buffer.from(identity.serverAddress, 'utf8');
  const addressLengthBuffer = Buffer.alloc(2);
  addressLengthBuffer.writeInt16BE(addressBuffer.length, 0);
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeInt16BE(identity.port & 0xffff, 0);
  const payload = Buffer.concat([
    dcBuffer,
    addressLengthBuffer,
    addressBuffer,
    portBuffer,
    identity.authKey,
  ]);
  return `1${payload.toString('base64')}`;
}

/**
 * Converts a GramJS (or teleproto-derived) session into the canonical
 * teleproto-compatible wire string. Deterministic: re-emitting the parsed
 * identity reproduces the original GramJS session string, so the authenticated
 * session can never be corrupted by a round trip.
 */
export async function toTeleprotoStringSession(session: StringSession | string): Promise<string> {
  return buildGramjsString(await getSessionIdentity(session));
}

/**
 * Rebuilds a GramJS `StringSession` from the canonical teleproto-compatible
 * wire string, so the existing GramJS-backed collector keeps working.
 */
export function fromTeleprotoStringSession(teleprotoString: string): StringSession {
  return new StringSession(teleprotoString);
}
